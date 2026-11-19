import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type Client } from "pg";
import { applyUntil, withDatabase } from "../../database/migration-test-utils.js";
import { ValidationError } from "../../shared/errors.js";
import { projectAccessSql } from "../projects/project-access.js";
import { AllocationOverlapError, AllocationsRepository } from "./allocations.repository.js";
import { DevelopersRepository } from "./developers.repository.js";

// Aponte TEAM_TEST_DATABASE_URL para um PostgreSQL descartável; o teste cria e remove o próprio banco.
const adminUrl = process.env.TEAM_TEST_DATABASE_URL;

function poolFor(client: Client): Pool {
  return new Pool({
    host: client.host, port: client.port, user: client.user,
    password: client.password ?? undefined, database: client.database, max: 4,
  });
}

function saoPauloDay(iso: string | null): string | null {
  return iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : null;
}

test("S3-10: alocação valida período, concede acesso e alimenta o histórico consolidado", { skip: !adminUrl }, async () => {
  await withDatabase(adminUrl!, async (client, vectorAvailable) => {
    await applyUntil(client, vectorAvailable, () => false);
    const ids = {
      po: randomUUID(), devUser: randomUUID(), dev: randomUUID(),
      atlas: randomUUID(), boreal: randomUUID(), archived: randomUUID(), epic: randomUUID(), ts: randomUUID(),
    };
    await client.query(
      `INSERT INTO usuario (id, nome, email, senha_hash, role) VALUES
        ($1,'PO','po-s310@example.test','x','po'), ($2,'Dev','dev-s310@example.test','x','dev')`,
      [ids.po, ids.devUser],
    );
    await client.query("INSERT INTO desenvolvedor (id, usuario_id, senioridade) VALUES ($1,$2,'Pleno')", [ids.dev, ids.devUser]);
    await client.query(
      `INSERT INTO projeto (id, nome, cliente, status) VALUES
        ($1,'Atlas','PRO4TECH','ativo'), ($2,'Boreal','PRO4TECH','ativo'), ($3,'Antigo','PRO4TECH','arquivado')`,
      [ids.atlas, ids.boreal, ids.archived],
    );
    await client.query("INSERT INTO epico (id, projeto_id, titulo) VALUES ($1,$2,'Pagamentos')", [ids.epic, ids.atlas]);
    await client.query("INSERT INTO tecnologia (id, nome, categoria) VALUES ($1,'TypeScript','backend')", [ids.ts]);
    await client.query("INSERT INTO entidade_tecnologia (entidade_tipo, entidade_id, tecnologia_id) VALUES ('epico',$1,$2)", [ids.epic, ids.ts]);

    const pool = poolFor(client);
    const hasAccess = async (projectId: string) =>
      Boolean((await client.query(`SELECT 1 WHERE ${projectAccessSql("$1::uuid", "$2::uuid")}`, [projectId, ids.devUser])).rowCount);
    try {
      const repository = new AllocationsRepository(pool);
      assert.equal(await hasAccess(ids.atlas), false);

      const current = await repository.create(ids.dev, { projeto_id: ids.atlas, papel: "Backend", data_inicio: "2026-01-05", data_fim: null }, ids.po);
      assert.equal(current.em_andamento, true);
      assert.equal(saoPauloDay(current.data_inicio), "2026-01-05");
      assert.equal(await hasAccess(ids.atlas), true);

      // Período encerrado: o último dia informado é o dia gravado, no fuso de São Paulo.
      const past = await repository.create(ids.dev, { projeto_id: ids.boreal, papel: "Tech Lead", data_inicio: "2025-02-01", data_fim: "2025-06-30" }, ids.po);
      assert.equal(past.em_andamento, false);
      assert.equal(saoPauloDay(past.data_fim), "2025-06-30");
      assert.equal(await hasAccess(ids.boreal), false);
      const originalPastDates = { data_inicio: past.data_inicio, data_fim: past.data_fim };
      const roleOnlyUpdate = await repository.update(ids.dev, past.id, { papel: "Arquiteto" }, ids.po);
      assert.equal(roleOnlyUpdate.data_inicio, originalPastDates.data_inicio);
      assert.equal(roleOnlyUpdate.data_fim, originalPastDates.data_fim);

      await assert.rejects(
        () => repository.create(ids.dev, { projeto_id: ids.atlas, papel: "QA", data_inicio: "2026-03-01", data_fim: "2026-04-01" }, ids.po),
        AllocationOverlapError,
      );
      await assert.rejects(
        () => repository.create(ids.dev, { projeto_id: ids.archived, papel: "QA", data_inicio: "2026-03-01", data_fim: null }, ids.po),
        ValidationError,
      );
      await assert.rejects(
        () => repository.create(ids.dev, { projeto_id: randomUUID(), papel: "QA", data_inicio: "2026-03-01", data_fim: null }, ids.po),
        ValidationError,
      );
      // Encerrar antes do início gravado é barrado mesmo informando só o término.
      await assert.rejects(() => repository.update(ids.dev, current.id, { data_fim: "2025-12-31" }, ids.po), /anterior à data de início/);
      await assert.rejects(
        () => client.query("UPDATE alocacao SET data_fim = data_inicio - interval '1 day' WHERE id=$1", [current.id]),
        (error: { code?: string }) => error.code === "23514",
      );

      // Histórico consolidado reflete a nova alocação sem atualização manual (PBI-05.2.3).
      const profile = await new DevelopersRepository(pool).getConsolidatedProfile(ids.dev, ids.po);
      const atlas = profile?.historico_consolidado.find((item) => item.projeto_id === ids.atlas);
      assert.deepEqual(atlas?.papeis, ["Backend"]);
      assert.deepEqual(atlas?.tecnologias.map((tech) => tech.nome), ["TypeScript"]);
      assert.equal(profile?.historico_consolidado.length, 2);

      const ended = await repository.update(ids.dev, current.id, { data_fim: "2026-01-10", papel: "Backend sênior" }, ids.po);
      assert.equal(ended.em_andamento, false);
      assert.equal(await hasAccess(ids.atlas), false);

      await repository.remove(ids.dev, past.id, ids.po);
      const audit = await client.query<{ acao: string }>(
        "SELECT acao FROM auditoria WHERE entidade_tipo='alocacao' AND usuario_id=$1 ORDER BY created_at", [ids.po]);
      assert.deepEqual(audit.rows.map((row) => row.acao), ["REGISTRAR_ALOCACAO", "REGISTRAR_ALOCACAO", "ATUALIZAR_ALOCACAO", "REMOVER_ALOCACAO"]);
    } finally {
      await pool.end();
    }
  });
});
