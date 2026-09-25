import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { ProjectsRepository } from "./projects.repository.js";
import { replaceEntityTechnologies } from "../technologies/entity-technologies.js";
import { EpicsRepository } from "../epics/epics.repository.js";
import { FeaturesRepository } from "../features/features.repository.js";
import { PbisRepository } from "../pbis/pbis.repository.js";

test("backlog tree uses one repeatable-read snapshot and releases its connection", async () => {
  const statements: string[] = [];
  const project = { id: randomUUID(), nome: "Teste", status: "ativo" };
  const fakeClient = {
    async query(sql: string) {
      statements.push(sql.trim());
      if (sql.includes("FROM projeto")) return { rows: [project], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() { statements.push("RELEASE"); },
  };
  const fakePool = { connect: async () => fakeClient } as unknown as Pool;
  const result = await new ProjectsRepository(fakePool).findBacklogTree(project.id);

  assert.equal(result?.project.id, project.id);
  assert.deepEqual(statements[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(statements.at(-2), "COMMIT");
  assert.equal(statements.at(-1), "RELEASE");
  assert.ok(statements.slice(1, -2).every((sql) => sql.startsWith("SELECT")));
});

test("backlog tree PostgreSQL integration", { skip: !process.env.BACKLOG_TREE_TEST_DATABASE_URL }, async (t) => {
  const connectionString = validateTarget(process.env.BACKLOG_TREE_TEST_DATABASE_URL, "test");
  const db = new Pool({ connectionString });
  const repository = new ProjectsRepository(db);
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  let epicId = "";
  let featureId = "";
  let pbiId = "";
  const technologyIds = [randomUUID(), randomUUID(), randomUUID()];

  try {
    await db.query(
      "INSERT INTO projeto (id,nome,cliente,status) VALUES ($1,'Tree test','QA','ativo'),($2,'Other tree test','QA','ativo')",
      [projectId, otherProjectId],
    );
    await db.query(
      "INSERT INTO tecnologia (id,nome) VALUES ($1,'Tree Epic Tech'),($2,'Tree Feature Tech'),($3,'Tree PBI Tech')",
      technologyIds,
    );

    const epics = new EpicsRepository(db);
    const features = new FeaturesRepository(db);
    const pbis = new PbisRepository(db);
    const epic = await epics.create({
      projeto_id: projectId,
      titulo: "Epic",
      prioridade: "Must",
      tecnologias_ids: [technologyIds[0], technologyIds[0]],
    });
    epicId = epic.id;
    const feature = await features.create({
      epico_id: epic.id,
      titulo: "Feature",
      prioridade: "Must",
      tecnologias_ids: [technologyIds[1]],
    });
    featureId = feature.id;
    const pbi = await pbis.create({
      feature_id: feature.id,
      titulo: "PBI",
      historia_como_um: "PO",
      historia_eu_quero: "filtrar",
      historia_para_que: "com confiança",
      tipo: "Funcional",
      prioridade: "Must",
      requer_interface: false,
      tecnologias_ids: [technologyIds[2]],
    });
    pbiId = pbi.id;

    await assert.rejects(
      epics.create({
        projeto_id: projectId,
        titulo: "Must roll back",
        prioridade: "Must",
        tecnologias_ids: [randomUUID()],
      }),
      /tecnologias selecionadas não existem/i,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS total FROM epico WHERE projeto_id=$1", [projectId])).rows[0].total,
      1,
    );

    await t.test("associações por nível entram na árvore e ficam isoladas por projeto", async () => {
      const tree = await repository.findBacklogTree(projectId);
      assert.ok(tree);
      assert.deepEqual(tree.epics[0].tecnologias.map((item) => item.id), [technologyIds[0]]);
      assert.deepEqual(tree.epics[0].features[0].tecnologias.map((item) => item.id), [technologyIds[1]]);
      assert.deepEqual(tree.epics[0].features[0].pbis[0].tecnologias.map((item) => item.id), [technologyIds[2]]);
      assert.deepEqual((await repository.findBacklogTree(otherProjectId))?.epics, []);
      assert.equal(await repository.findBacklogTree(randomUUID()), null);
    });

    await t.test("substituir com lista vazia remove tags e auditoria registra a alteração", async () => {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await replaceEntityTechnologies(client, "epico", epicId, []);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      assert.deepEqual((await repository.findBacklogTree(projectId))?.epics[0].tecnologias, []);

      await new EpicsRepository(db).update(epicId, { tecnologias_ids: [technologyIds[0]] });
      assert.deepEqual((await repository.findBacklogTree(projectId))?.epics[0].tecnologias.map((item) => item.id), [technologyIds[0]]);

      const audit = await db.query<{ dados_json: Record<string, unknown> }>(
        "SELECT dados_json FROM auditoria WHERE entidade_id=$1 AND acao='ATUALIZAR_EPICO' ORDER BY created_at DESC LIMIT 1",
        [epicId],
      );
      assert.deepEqual((audit.rows[0].dados_json.alteracoes as Record<string, unknown>).tecnologias_ids, [technologyIds[0]]);

      const invalidClient = await db.connect();
      try {
        await invalidClient.query("BEGIN");
        await assert.rejects(
          replaceEntityTechnologies(invalidClient, "epico", epicId, [randomUUID()]),
          /tecnologias selecionadas não existem/i,
        );
        await invalidClient.query("ROLLBACK");
      } finally {
        invalidClient.release();
      }
      assert.deepEqual((await repository.findBacklogTree(projectId))?.epics[0].tecnologias.map((item) => item.id), [technologyIds[0]]);
    });

    await t.test("baseline de escala: adiciona 25 épicos, 125 features e 625 PBIs", async () => {
      const benchmarkEpicIds = Array.from({ length: 25 }, () => randomUUID());
      const benchmarkFeatureIds = Array.from({ length: 125 }, () => randomUUID());
      const benchmarkPbiIds = Array.from({ length: 625 }, () => randomUUID());
      const featureEpicIds = benchmarkFeatureIds.map((_, index) => benchmarkEpicIds[index % benchmarkEpicIds.length]);
      const pbiFeatureIds = benchmarkPbiIds.map((_, index) => benchmarkFeatureIds[index % benchmarkFeatureIds.length]);
      const pbiCodes = benchmarkPbiIds.map((_, index) => `TREE-BENCH-${index}`);

      await db.query(
        `INSERT INTO epico (id,projeto_id,titulo)
         SELECT item.id,$2,'Benchmark epic ' || item.ordinality
         FROM unnest($1::uuid[]) WITH ORDINALITY AS item(id,ordinality)`,
        [benchmarkEpicIds, projectId],
      );
      await db.query(
        `INSERT INTO feature (id,epico_id,titulo)
         SELECT item.id,item.epico_id,'Benchmark feature ' || item.ordinality
         FROM unnest($1::uuid[],$2::uuid[]) WITH ORDINALITY AS item(id,epico_id,ordinality)`,
        [benchmarkFeatureIds, featureEpicIds],
      );
      await db.query(
        `INSERT INTO pbi (id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que)
         SELECT item.id,item.feature_id,item.codigo,'Benchmark PBI ' || item.ordinality,'PO','consultar','obter resultado'
         FROM unnest($1::uuid[],$2::uuid[],$3::text[]) WITH ORDINALITY AS item(id,feature_id,codigo,ordinality)`,
        [benchmarkPbiIds, pbiFeatureIds, pbiCodes],
      );

      const startedAt = performance.now();
      const tree = await repository.findBacklogTree(projectId);
      const durationMs = performance.now() - startedAt;
      assert.ok(tree);
      const featureCount = tree.epics.reduce((total, epic) => total + epic.features.length, 0);
      const pbiCount = tree.epics.reduce(
        (total, epic) => total + epic.features.reduce((subtotal, feature) => subtotal + feature.pbis.length, 0),
        0,
      );
      const responseBytes = Buffer.byteLength(JSON.stringify(tree));
      console.log(`[S1-16 scale] 26 epics, ${featureCount} features, ${pbiCount} PBIs; ${durationMs.toFixed(1)} ms; ${responseBytes} bytes`);
      assert.equal(tree.epics.length, 26); // 25 de benchmark + 1 da fixture funcional acima.
      assert.equal(featureCount, 126); // 125 de benchmark + 1 da fixture funcional acima.
      assert.equal(pbiCount, 626); // 625 de benchmark + 1 da fixture funcional acima.
      assert.ok(durationMs < 2000, `árvore levou ${durationMs.toFixed(1)} ms; limite de 2000 ms excedido`);
      assert.ok(responseBytes < 5 * 1024 * 1024, `resposta excedeu 5 MiB: ${responseBytes} bytes`);
    });
  } finally {
    await db.query(
      `DELETE FROM auditoria WHERE entidade_id IN (
        SELECT id FROM epico WHERE projeto_id = $1
        UNION SELECT f.id FROM feature f JOIN epico e ON e.id=f.epico_id WHERE e.projeto_id = $1
        UNION SELECT p.id FROM pbi p JOIN feature f ON f.id=p.feature_id JOIN epico e ON e.id=f.epico_id WHERE e.projeto_id = $1
      )`,
      [projectId],
    );
    await db.query("DELETE FROM projeto WHERE id = ANY($1::uuid[])", [[projectId, otherProjectId]]);
    await db.query("DELETE FROM tecnologia WHERE id = ANY($1::uuid[])", [technologyIds]);
    await db.end();
  }
});
