import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { ProjectsRepository } from "./projects.repository.js";
import { ArchiveConflict } from "./archive.types.js";
import { projectQuerySchema } from "./projects.types.js";

// Only a dedicated *_test database is accepted; fixtures are removed by ID.
test("S1-09: cascata transacional no PostgreSQL", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async (t) => {
  const pool = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const repo = new ProjectsRepository(pool);
  const ids = Array.from({ length: 8 }, () => randomUUID());
  const [project, other, epic, feature, pbi, oldPbi, criterion, missing] = ids;
  const historical = "2025-01-01T00:00:00.000Z";
  const impact = { projeto: 1, epicos: 1, features: 1, pbis: 1 };
  try {
    await pool.query("INSERT INTO projeto (id,nome,cliente,status) VALUES ($1::uuid,$1::text,'Teste','ativo'),($2::uuid,$2::text,'Teste','ativo')", [project, other]);
    await pool.query("INSERT INTO epico (id,projeto_id,titulo) VALUES ($1,$2,'Épico')", [epic, project]);
    await pool.query("INSERT INTO feature (id,epico_id,titulo) VALUES ($1,$2,'Feature')", [feature, epic]);
    await pool.query("INSERT INTO pbi (id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que) VALUES ($1,$3,'T1','PBI','PO','arquivar','preservar'),($2,$3,'T2','Antigo','PO','consultar','preservar')", [pbi, oldPbi, feature]);
    await pool.query("UPDATE pbi SET status='arquivado',archived_at=$2 WHERE id=$1", [oldPbi, historical]);
    await pool.query("INSERT INTO criterio_aceitacao (id,entidade_tipo,entidade_id,texto,nome,dado,quando,entao) VALUES ($1,'pbi',$2,'Critério preservado','Preservar','um item','arquivar','preservar histórico')", [criterion, pbi]);

    await t.test("prévia conta somente novos afetados e não inventa projeto inexistente", async () => {
      assert.deepEqual(await repo.archiveImpact(project), impact);
      assert.equal(await repo.archiveImpact(missing), null);
    });
    await t.test("contagem desatualizada reverte sem gravar", async () => {
      await assert.rejects(repo.archive(project, null, undefined, { ...impact, pbis: 0 }), ArchiveConflict);
      assert.equal((await repo.findById(project))?.status, "ativo");
      assert.deepEqual(await repo.archiveImpact(project), impact);
    });
    await t.test("falha da auditoria desfaz toda a cascata", async () => {
      await assert.rejects(repo.archive(project, missing, undefined, impact));
      assert.deepEqual(await repo.archiveImpact(project), impact);
      assert.equal((await repo.findById(project))?.archived_at, null);
    });
    await t.test("arquiva todos os níveis, preserva critério, data anterior e outro projeto", async () => {
      const result = await repo.archive(project, null, undefined, impact);
      assert.equal(result?.status, "arquivado");
      assert.ok(result?.archived_at);
      for (const [table, id] of [["epico", epic], ["feature", feature], ["pbi", pbi]]) {
        const row = (await pool.query(`SELECT status, archived_at FROM ${table} WHERE id=$1`, [id])).rows[0];
        assert.equal(row.status, "arquivado");
        assert.equal(row.archived_at.toISOString(), new Date(result!.archived_at!).toISOString());
      }
      assert.equal((await pool.query("SELECT archived_at FROM pbi WHERE id=$1", [oldPbi])).rows[0].archived_at.toISOString(), historical);
      assert.equal((await pool.query("SELECT texto FROM criterio_aceitacao WHERE id=$1", [criterion])).rows[0].texto, "Critério preservado");
      assert.equal((await repo.findById(other))?.status, "ativo");
      const audit = (await pool.query("SELECT dados_json FROM auditoria WHERE entidade_id=$1 AND acao='ARQUIVAR_PROJETO'", [project])).rows;
      assert.equal(audit.length, 1);
      assert.deepEqual(audit[0].dados_json.impacto, impact);
    });
    await t.test("repetição é idempotente e edição de arquivado é recusada", async () => {
      const before = await repo.findById(project);
      await repo.archive(project, null, undefined, impact);
      assert.deepEqual((await repo.findById(project))?.archived_at, before?.archived_at);
      assert.equal((await pool.query("SELECT count(*)::int n FROM auditoria WHERE entidade_id=$1", [project])).rows[0].n, 1);
      await assert.rejects(repo.update(project, { nome: "Alterado" }), ArchiveConflict);
    });
    await t.test("listagem padrão oculta arquivados e filtros permitem consulta", async () => {
      const query = { busca: project };
      assert.equal((await repo.findAll(projectQuerySchema.parse(query))).total, 0);
      for (const status of ["arquivado", "todos"]) {
        const result = await repo.findAll(projectQuerySchema.parse({ ...query, status }));
        assert.equal(result.total, 1); assert.ok(result.items[0].archived_at);
      }
    });
  } finally {
    await pool.query("DELETE FROM criterio_aceitacao WHERE id=$1", [criterion]);
    await pool.query("DELETE FROM auditoria WHERE entidade_id = ANY($1::uuid[])", [[project, other]]);
    await pool.query("DELETE FROM projeto WHERE id = ANY($1::uuid[])", [[project, other]]);
    await pool.end();
  }
});
