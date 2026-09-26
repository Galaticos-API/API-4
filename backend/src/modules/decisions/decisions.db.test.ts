import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { ArchiveConflict } from "../projects/archive.types.js";
import { lockHierarchy } from "../projects/hierarchy-archive.js";
import { DecisionsRepository } from "./decisions.repository.js";
import { DecisionsService } from "./decisions.service.js";

test("S1-18: decisões em qualquer nível, herança, isolamento e arquivamento no PostgreSQL", { skip: !process.env.BACKLOG_TREE_TEST_DATABASE_URL }, async (t) => {
  const pool = new Pool({ connectionString: validateTarget(process.env.BACKLOG_TREE_TEST_DATABASE_URL, "test") });
  const service = new DecisionsService(new DecisionsRepository(pool));
  const [user, projectA, projectB, epicA, featureA, pbiA, epicB, featureB, pbiB, archivedProject] = Array.from({ length: 10 }, () => randomUUID());
  const body = (titulo: string, extra: Record<string, unknown> = {}) => ({ titulo, contexto: "Contexto", decisao: "Decisão", justificativa: "Motivo", ...extra });
  try {
    await pool.query("INSERT INTO usuario (id,nome,email,senha_hash,role) VALUES ($1,'Ana PO',$2,'h','po')", [user, `${user}@decisoes.test`]);
    await pool.query("INSERT INTO projeto (id,nome,cliente,status) VALUES ($1::uuid,$1::text,'T','ativo'),($2::uuid,$2::text,'T','ativo'),($3::uuid,$3::text,'T','ativo')", [projectA, projectB, archivedProject]);
    await pool.query("INSERT INTO epico (id,projeto_id,titulo) VALUES ($1,$2,'Épico A'),($3,$4,'Épico B')", [epicA, projectA, epicB, projectB]);
    await pool.query("INSERT INTO feature (id,epico_id,titulo) VALUES ($1,$2,'Feature A'),($3,$4,'Feature B')", [featureA, epicA, featureB, epicB]);
    await pool.query(`INSERT INTO pbi (id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que) VALUES
      ($1,$2,'PBI-D.1','PBI A','PO','x','y'),($3,$4,'PBI-D.2','PBI B','PO','x','y')`, [pbiA, featureA, pbiB, featureB]);

    await t.test("registra em todos os níveis com autor, data e auditoria", async () => {
      const levels = [["projeto", projectA], ["epico", epicA], ["feature", featureA], ["pbi", pbiA]] as const;
      for (const [tipo, id] of levels) {
        const created = await service.create(tipo, id, user, body(`Decisão ${tipo}`, tipo === "pbi" ? { alternativas: "Alternativa descartada" } : {}));
        assert.equal(created.autor?.nome, "Ana PO");
        assert.ok(Date.parse(created.created_at));
        assert.equal(created.origem.tipo, tipo);
      }
      const audits = await pool.query("SELECT entidade_tipo FROM auditoria WHERE acao='REGISTRAR_DECISAO' AND usuario_id=$1 ORDER BY entidade_tipo", [user]);
      assert.deepEqual(audits.rows.map((row) => row.entidade_tipo), ["epico", "feature", "pbi", "projeto"]);
    });

    await t.test("o PBI enxerga as decisões dos ascendentes, na ordem cronológica, marcadas como herdadas", async () => {
      const result = await service.list("pbi", pbiA);
      assert.deepEqual(result.decisoes.map((item) => item.origem.tipo), ["projeto", "epico", "feature", "pbi"]);
      assert.deepEqual(result.decisoes.map((item) => item.origem.herdada), [true, true, true, false]);
      assert.equal(result.decisoes[3].alternativas, "Alternativa descartada");
      assert.deepEqual(result.ancestrais.map((node) => node.titulo), [projectA, "Épico A", "Feature A"]);
      assert.equal(result.entidade.codigo, "PBI-D.1");
    });

    await t.test("ascendentes não listam decisões de descendentes", async () => {
      assert.deepEqual((await service.list("epico", epicA)).decisoes.map((item) => item.origem.tipo), ["projeto", "epico"]);
      assert.deepEqual((await service.list("projeto", projectA)).decisoes.map((item) => item.origem.tipo), ["projeto"]);
    });

    await t.test("isolamento: outro projeto não recebe decisões do primeiro", async () => {
      await service.create("pbi", pbiB, user, body("Decisão do PBI B"));
      assert.deepEqual((await service.list("pbi", pbiB)).decisoes.map((item) => item.titulo), ["Decisão do PBI B"]);
      assert.ok(!(await service.list("pbi", pbiA)).decisoes.some((item) => item.titulo === "Decisão do PBI B"));
    });

    await t.test("registrar decisão não exige nem altera o status do item", async () => {
      const before = (await pool.query("SELECT status FROM pbi WHERE id=$1", [pbiA])).rows[0].status;
      await service.create("pbi", pbiA, user, body("Mais uma"));
      assert.equal((await pool.query("SELECT status FROM pbi WHERE id=$1", [pbiA])).rows[0].status, before);
    });

    await t.test("projeto arquivado recusa decisões e corrida com o arquivamento resulta em conflito", async () => {
      const archiver = await pool.connect();
      try {
        await archiver.query("BEGIN");
        await lockHierarchy(archiver);
        await archiver.query("UPDATE projeto SET status='arquivado' WHERE id=$1", [archivedProject]);
        const attempt = service.create("projeto", archivedProject, user, body("Corrida"));
        await new Promise((resolve) => setTimeout(resolve, 150));
        await archiver.query("COMMIT");
        await assert.rejects(attempt, ArchiveConflict);
      } finally {
        archiver.release();
      }
      await assert.rejects(service.create("projeto", archivedProject, user, body("Depois")), ArchiveConflict);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM decisao WHERE entidade_id=$1", [archivedProject])).rows[0].n, 0);
      assert.deepEqual((await service.list("projeto", archivedProject)).decisoes, []);
    });

    await t.test("restrição rejeita tipo de entidade desconhecido", async () => {
      await assert.rejects(pool.query("INSERT INTO decisao (entidade_tipo,entidade_id,titulo,contexto,decisao,justificativa) VALUES ('documento',$1,'x','c','d','j')", [randomUUID()]), /ck_decisao_entidade_tipo/);
    });
  } finally {
    await pool.query("DELETE FROM decisao WHERE entidade_id = ANY($1::uuid[])", [[projectA, epicA, featureA, pbiA, pbiB, projectB, archivedProject]]);
    await pool.query("DELETE FROM auditoria WHERE usuario_id=$1", [user]);
    await pool.query("DELETE FROM projeto WHERE id = ANY($1::uuid[])", [[projectA, projectB, archivedProject]]);
    await pool.query("DELETE FROM usuario WHERE id=$1", [user]);
    await pool.end();
  }
});
