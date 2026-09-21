import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { HierarchyArchiveRepository, lockHierarchy } from "./hierarchy-archive.js";
import { ArchiveConflict } from "./archive.types.js";
import { FeaturesRepository } from "../features/features.repository.js";
import { featureQuerySchema } from "../features/features.types.js";
import { CriteriaRepository } from "../criteria/criteria.repository.js";

test("S1-09: arquivamento direto, preservação, filtros e escrita concorrente", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async (t) => {
  const db = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const archive = new HierarchyArchiveRepository(db);
  try {
    for (const kind of ["pbi", "feature", "epico"] as const) await t.test(kind, async () => {
      const [project, epic, feature, pbi, sibling, criterion] = Array.from({ length: 6 }, randomUUID);
      const id = kind === "epico" ? epic : kind === "feature" ? feature : pbi;
      try {
        await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES ($1::uuid,$1::text,'Teste','ativo')", [project]);
        await db.query("INSERT INTO epico(id,projeto_id,titulo,status) VALUES ($1,$2,'Épico','rascunho')", [epic, project]);
        await db.query("INSERT INTO feature(id,epico_id,titulo,status) VALUES ($1,$3,'Feature','rascunho'),($2,$3,'Outra','rascunho')", [feature, sibling, epic]);
        await db.query("INSERT INTO pbi(id,feature_id,codigo,titulo,status,historia_como_um,historia_eu_quero,historia_para_que) VALUES ($1::uuid,$2,$1::text,'PBI','rascunho','PO','arquivar','preservar')", [pbi, feature]);
        await db.query("INSERT INTO criterio_aceitacao(id,entidade_tipo,entidade_id,nome,dado,quando,entao) VALUES ($1,'pbi',$2,'Preservar','contexto','ação','resultado')", [criterion, pbi]);
        const impact = await archive.impact(kind, id);
        assert.deepEqual(impact, { epicos: kind === "epico" ? 1 : 0, features: kind === "epico" ? 2 : kind === "feature" ? 1 : 0, pbis: 1 });
        await assert.rejects(archive.archive(kind, id, { confirmado: true, impacto: { ...impact, pbis: 2 } }), ArchiveConflict);
        await assert.rejects(archive.archive(kind, id, { confirmado: true, impacto: impact }, randomUUID()));
        assert.deepEqual(await archive.impact(kind, id), impact, "falha de auditoria reverte a cascata");
        const saved = await archive.archive(kind, id, { confirmado: true, impacto: impact });
        assert.equal(saved.status, "arquivado");
        assert.ok(saved.archived_at);
        assert.equal((await db.query("SELECT status FROM projeto WHERE id=$1", [project])).rows[0].status, "ativo");
        assert.equal((await db.query("SELECT status FROM feature WHERE id=$1", [sibling])).rows[0].status, kind === "epico" ? "arquivado" : "rascunho");
        assert.equal((await db.query("SELECT nome FROM criterio_aceitacao WHERE id=$1", [criterion])).rows[0].nome, "Preservar");
        const again = await archive.archive(kind, id, { confirmado: true, impacto: impact });
        assert.deepEqual(again.archived_at, saved.archived_at);
        assert.equal((await db.query("SELECT count(*)::int n FROM auditoria WHERE entidade_id=$1", [id])).rows[0].n, 1);
        const criteria = new CriteriaRepository(db);
        await assert.rejects(criteria.create({ entidade_tipo: "pbi", entidade_id: pbi, nome: "Novo", dado: "x", quando: "y", entao: "z" }), ArchiveConflict);
        await assert.rejects(criteria.move(criterion, "up"), ArchiveConflict);
        await assert.rejects(criteria.delete(criterion), ArchiveConflict);
        if (kind !== "pbi") {
          const features = new FeaturesRepository(db);
          await assert.rejects(features.update(feature, { titulo: "Alterado" }), ArchiveConflict);
          await assert.rejects(features.markConcluded(feature), ArchiveConflict);
          assert.equal((await features.findAll(featureQuerySchema.parse({ epico_id: epic }))).items.some(row => row.id === feature), false);
          assert.equal((await features.findAll(featureQuerySchema.parse({ epico_id: epic, status: "arquivado" }))).items.some(row => row.id === feature), true);
        }
        if (kind === "epico") {
          // Simulate a request that passed its service check before an archive committed.
          const blocker = await db.connect();
          await blocker.query("BEGIN");
          await lockHierarchy(blocker);
          const writer = new FeaturesRepository(db).create({ epico_id: epic, titulo: "Tardia", prioridade: "Must" });
          const rejected = assert.rejects(writer, ArchiveConflict);
          await blocker.query("COMMIT"); blocker.release();
          await rejected;
        }
      } finally {
        await db.query("DELETE FROM criterio_aceitacao WHERE id=$1", [criterion]);
        await db.query("DELETE FROM auditoria WHERE entidade_id=ANY($1::uuid[])", [[epic, feature, pbi]]);
        await db.query("DELETE FROM projeto WHERE id=$1", [project]);
      }
    });
  } finally { await db.end(); }
});
