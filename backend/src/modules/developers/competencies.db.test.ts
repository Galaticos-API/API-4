import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type Client } from "pg";
import { applyUntil, loadMigration, withDatabase } from "../../database/migration-test-utils.js";
import {
  CompetenciesRepository,
  CompetencyExistsError,
  TechnologyNotInVocabularyError,
} from "./competencies.repository.js";

// Aponte TEAM_TEST_DATABASE_URL para um PostgreSQL descartável; o teste cria e remove o próprio banco.
const adminUrl = process.env.TEAM_TEST_DATABASE_URL;

function poolFor(client: Client): Pool {
  return new Pool({
    host: client.host, port: client.port, user: client.user,
    password: client.password ?? undefined, database: client.database, max: 4,
  });
}

test("S3-09: migration unifica competências repetidas e repositório exige vocabulário", { skip: !adminUrl }, async () => {
  await withDatabase(adminUrl!, async (client, vectorAvailable) => {
    await applyUntil(client, vectorAvailable, (file) => file.startsWith("030_"));
    const ids = { user: randomUUID(), dev: randomUUID(), ts: randomUUID(), pg: randomUUID() };
    await client.query("INSERT INTO usuario (id, nome, email, senha_hash, role) VALUES ($1,'PO','po-s309@example.test','x','po')", [ids.user]);
    await client.query("INSERT INTO desenvolvedor (id, nome, senioridade) VALUES ($1,'Ana','Senior')", [ids.dev]);
    await client.query("INSERT INTO tecnologia (id, nome, categoria) VALUES ($1,'TypeScript','backend'), ($2,'PostgreSQL','database')", [ids.ts, ids.pg]);
    await client.query(
      `INSERT INTO competencia (desenvolvedor_id, tecnologia_id, nivel, evidencia, created_at) VALUES
        ($1,$2,'intermediario','Projeto Atlas', now() - interval '2 days'),
        ($1,$2,'especialista','Projeto Boreal', now() - interval '3 days'),
        ($1,$3,'mestre', NULL, now())`,
      [ids.dev, ids.ts, ids.pg],
    );

    await client.query(await loadMigration("030_competencies.sql", vectorAvailable));
    await client.query("INSERT INTO _schema_migrations (version) VALUES ('030_competencies.sql')");

    const rows = await client.query<{ tecnologia_id: string; nivel: string; evidencia: string | null }>(
      "SELECT tecnologia_id, nivel, evidencia FROM competencia WHERE desenvolvedor_id=$1 ORDER BY nivel",
    [ids.dev]);
    assert.equal(rows.rowCount, 2);
    const ts = rows.rows.find((row) => row.tecnologia_id === ids.ts)!;
    assert.equal(ts.nivel, "especialista");
    assert.deepEqual(ts.evidencia?.split("\n").sort(), ["Projeto Atlas", "Projeto Boreal"]);
    assert.equal(rows.rows.find((row) => row.tecnologia_id === ids.pg)?.nivel, "intermediario");
    // O seed pode repetir um UUID histórico já removido pela deduplicação, mas a
    // chave natural já existe. O conflito sem alvo precisa ser ignorado com segurança.
    await client.query(
      `INSERT INTO competencia (id, desenvolvedor_id, tecnologia_id, nivel, evidencia)
       VALUES ($1, $2, $3, 'especialista', 'seed') ON CONFLICT DO NOTHING`,
      [randomUUID(), ids.dev, ids.ts],
    );
    assert.equal((await client.query("SELECT id FROM competencia WHERE desenvolvedor_id=$1 AND tecnologia_id=$2", [ids.dev, ids.ts])).rowCount, 1);
    await assert.rejects(
      () => client.query("INSERT INTO competencia (desenvolvedor_id, tecnologia_id, nivel) VALUES ($1,$2,'avancado')", [ids.dev, ids.ts]),
      (error: { code?: string }) => error.code === "23505",
    );

    await applyUntil(client, vectorAvailable, () => false);
    await client.query("DELETE FROM competencia WHERE desenvolvedor_id=$1", [ids.dev]);
    const pool = poolFor(client);
    try {
      const repository = new CompetenciesRepository(pool);
      const created = await repository.create(ids.dev, { tecnologia_id: ids.ts, nivel: "avancado", evidencia: "Entregou o módulo de busca." }, ids.user);
      assert.equal(created.tecnologia_nome, "TypeScript");
      await assert.rejects(
        () => repository.create(ids.dev, { tecnologia_id: ids.ts, nivel: "iniciante", evidencia: "Outra evidência qualquer." }, ids.user),
        CompetencyExistsError,
      );
      await assert.rejects(
        () => repository.create(ids.dev, { tecnologia_id: randomUUID(), nivel: "iniciante", evidencia: "Outra evidência qualquer." }, ids.user),
        TechnologyNotInVocabularyError,
      );
      const updated = await repository.update(ids.dev, created.id, { nivel: "especialista" }, ids.user);
      assert.equal(updated.nivel, "especialista");
      assert.equal(updated.evidencia, "Entregou o módulo de busca.");
      await repository.remove(ids.dev, created.id, ids.user);

      const audit = await client.query<{ acao: string }>(
        "SELECT acao FROM auditoria WHERE entidade_tipo='competencia' AND usuario_id=$1 ORDER BY created_at", [ids.user]);
      assert.deepEqual(audit.rows.map((row) => row.acao), ["REGISTRAR_COMPETENCIA", "ATUALIZAR_COMPETENCIA", "REMOVER_COMPETENCIA"]);
    } finally {
      await pool.end();
    }
  });
});
