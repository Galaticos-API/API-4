import { FeaturesService } from "../features/features.service.js";
import { EpicsRepository } from "../epics/epics.repository.js";
import { EpicsService } from "../epics/epics.service.js";
import { ProjectsRepository } from "./projects.repository.js";
import { PbisService } from "../pbis/pbis.service.js";
import { CriteriaService } from "../criteria/criteria.service.js";
import { QualityService } from "../quality/quality.service.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { HierarchyArchiveRepository, lockHierarchy } from "./hierarchy-archive.js";
import { ArchiveConflict } from "./archive.types.js";
import { FeaturesRepository } from "../features/features.repository.js";
import { featureQuerySchema } from "../features/features.types.js";
import { PbisRepository } from "../pbis/pbis.repository.js";
import { AuditService } from "../audit/audit.service.js";
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

test("S1-09: uma hierarquia ativa continua permitindo criar feature e PBI", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async () => {
  const db = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const [project, epic] = Array.from({ length: 2 }, randomUUID);
  const ids: string[] = [project, epic];
  try {
    await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES ($1::uuid,$1::text,'Teste','ativo')", [project]);
    await db.query("INSERT INTO epico(id,projeto_id,titulo,status) VALUES ($1,$2,'Épico ativo','ativo')", [epic, project]);

    const featuresRepo = new FeaturesRepository(db);
    const epics = new EpicsService(new EpicsRepository(db), new ProjectsRepository(db));
    const features = new FeaturesService(featuresRepo, new EpicsRepository(db));
    const criteriaRepo = new CriteriaRepository(db);
    const criteria = new CriteriaService(criteriaRepo);
    const pbisRepo = new PbisRepository(db);
    const pbis = new PbisService(pbisRepo, featuresRepo, new QualityService(criteriaRepo, pbisRepo));
    const updated = await epics.update(epic, { titulo: "Épico ativo editado", descricao: "Descrição", objetivo: "Objetivo", escopo_macro: "Escopo", resultado_esperado: "Resultado" });
    assert.equal(updated.status, "ativo");
    const first = await criteria.create({ entidade_tipo: "epico", entidade_id: epic, texto: "Primeiro critério" });
    const second = await criteria.create({ entidade_tipo: "epico", entidade_id: epic, texto: "Segundo critério" });
    ids.push(first.id, second.id);
    await criteria.move(second.id, { direction: "up" });
    await criteria.delete(first.id);
    const createdFeature = await features.create({ epico_id: epic, titulo: "Feature em épico ativo", prioridade: "Must" });
    assert.equal(createdFeature.status, "rascunho");

    ids.push(createdFeature.id);
    const createdPbi = await pbis.create({
      feature_id: createdFeature.id,
      titulo: "Criar PBI em hierarquia ativa",
      historia_como_um: "Product Owner",
      historia_eu_quero: "cadastrar um PBI",
      historia_para_que: "continuar o refinamento",
      tipo: "Funcional",
      prioridade: "Must",
      requer_interface: false,
    });
    ids.push(createdPbi.id);
    assert.equal(createdPbi.status, "rascunho");
    assert.equal((await epics.complete(epic)).status, "concluido");
    const archive = new HierarchyArchiveRepository(db);
    await archive.archive("epico", epic, { confirmado: true, impacto: await archive.impact("epico", epic) });
    await assert.rejects(features.create({ epico_id: epic, titulo: "Bloqueada" }));
    await assert.rejects(epics.update(epic, { titulo: "Bloqueado" }));
    await assert.rejects(criteria.create({ entidade_tipo: "epico", entidade_id: epic, texto: "Bloqueado" }));
  } finally {
    await db.query("DELETE FROM criterio_aceitacao WHERE entidade_id=$1", [epic]);
    await db.query("DELETE FROM auditoria WHERE entidade_id=ANY($1::uuid[])", [ids]);
    await db.query("DELETE FROM projeto WHERE id=$1", [project]);
    await db.end();
  }
});

test("S1-24: transações exigem justificativa em alterações de itens concluídos", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async (t) => {
  const db = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const [project, epic, feature, pbi, lateFeature] = Array.from({ length: 5 }, randomUUID);
  const configId = "00000000-0000-4000-8000-000000000001";
  let originalConfiguration: unknown;
  const criteria = new CriteriaRepository(db);
  const epics = new EpicsRepository(db);
  const features = new FeaturesRepository(db);
  const pbis = new PbisRepository(db);

  try {
    const savedConfiguration = await db.query<{ configuration: unknown }>(
      "SELECT configuration FROM quality_configuration WHERE id = $1 FOR UPDATE",
      [configId],
    );
    assert.ok(savedConfiguration.rows[0], "o banco de teste deve estar migrado");
    originalConfiguration = savedConfiguration.rows[0].configuration;
    await db.query(
      `UPDATE quality_configuration
       SET configuration = jsonb_set(configuration, '{exigir_justificativa_item_concluido}', 'true'::jsonb, true)
       WHERE id = $1`,
      [configId],
    );

    await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES ($1::uuid,$2::text,'Teste','ativo')", [project, project]);
    await db.query("INSERT INTO epico(id,projeto_id,titulo,descricao,objetivo,escopo_macro,resultado_esperado,status) VALUES ($1,$2,'Épico','Descrição','Objetivo','Escopo','Resultado','concluido')", [epic, project]);
    await db.query("INSERT INTO feature(id,epico_id,titulo,descricao,objetivo,status) VALUES ($1,$2,'Feature','Descrição','Objetivo','concluido'),($3,$2,'Feature tardia','Descrição','Objetivo','rascunho')", [feature, epic, lateFeature]);
    await db.query("INSERT INTO pbi(id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que,status) VALUES ($1,$2,'PBI-001','PBI','PO','alterar','preservar','concluido')", [pbi, feature]);

    await t.test("update de épico, feature e PBI revalida sob lock e audita a justificativa", async () => {
      await assert.rejects(epics.update(epic, { titulo: "Épico sem justificativa" }), /justificativa é obrigatória/);
      await assert.rejects(features.update(feature, { titulo: "Feature sem justificativa" }), /justificativa é obrigatória/);
      await assert.rejects(pbis.update(pbi, { titulo: "PBI sem justificativa" }), /justificativa é obrigatória/);

      await epics.update(epic, { titulo: "Épico corrigido", justificativa: "Ajuste solicitado pelo PO" });
      await features.update(feature, { titulo: "Feature corrigida", justificativa: "Atualização do escopo aprovado" });
      await pbis.update(pbi, { titulo: "PBI corrigido", justificativa: "Correção após validação" });

      const audit = await db.query<{ entidade_tipo: string; justificativa: string }>(
        "SELECT entidade_tipo, justificativa FROM auditoria WHERE entidade_id = ANY($1::uuid[]) AND acao LIKE 'ATUALIZAR_%' ORDER BY entidade_tipo",
        [[epic, feature, pbi]],
      );
      assert.deepEqual(audit.rows.map((row) => row.justificativa), [
        "Ajuste solicitado pelo PO",
        "Atualização do escopo aprovado",
        "Correção após validação",
      ]);
      const history = await new AuditService(db).getHistory("pbi", pbi);
      assert.equal(history.items[0]?.pbi_versao, 1);
      assert.equal(history.items[0]?.pbi_snapshot?.titulo, "PBI corrigido");
    });

    await t.test("create, delete e move de critérios exigem justificativa e registram auditoria", async () => {
      for (const [tipo, entidadeId] of [["epico", epic], ["feature", feature], ["pbi", pbi]] as const) {
        const input = tipo === "pbi"
          ? { entidade_tipo: tipo, entidade_id: entidadeId, nome: `Cenário ${tipo}`, dado: "contexto", quando: "ação", entao: "resultado" }
          : { entidade_tipo: tipo, entidade_id: entidadeId, texto: `Critério ${tipo}` };
        await assert.rejects(criteria.create(input as any), /justificativa é obrigatória/);
        const first = await criteria.create({ ...input, justificativa: `Adicionar ${tipo}` } as any);
        const second = await criteria.create({ ...input, justificativa: `Adicionar segundo ${tipo}` } as any);

        await assert.rejects(criteria.move(second.id, "up"), /justificativa é obrigatória/);
        await criteria.move(second.id, "up", undefined, `Reordenar ${tipo}`);

        await assert.rejects(criteria.delete(first.id), /justificativa é obrigatória/);
        await criteria.delete(first.id, undefined, `Remover ${tipo}`);
      }

      const audit = await db.query<{ justificativa: string }>(
        "SELECT justificativa FROM auditoria WHERE entidade_id = ANY($1::uuid[]) AND acao IN ('ADICIONAR_CRITERIO','REMOVER_CRITERIO','REORDENAR_CRITERIO') ORDER BY created_at, id",
        [[epic, feature, pbi]],
      );
      assert.ok(audit.rows.length >= 12);
      assert.ok(audit.rows.every((row) => row.justificativa?.trim()));
    });

    await t.test("rejeita usando o status atual mesmo que a leitura prévia tenha sido rascunho", async () => {
      const preflight = await db.query<{ status: string }>("SELECT status FROM feature WHERE id = $1", [lateFeature]);
      assert.equal(preflight.rows[0]?.status, "rascunho");
      await db.query("UPDATE feature SET status = 'concluido' WHERE id = $1", [lateFeature]);
      await assert.rejects(
        features.update(lateFeature, { titulo: "Requisição com preflight obsoleto" }),
        /justificativa é obrigatória/,
      );
    });
  } finally {
    await db.query("DELETE FROM auditoria WHERE entidade_id = ANY($1::uuid[])", [[epic, feature, pbi, lateFeature]]);
    await db.query("DELETE FROM projeto WHERE id = $1", [project]);
    if (originalConfiguration !== undefined) {
      await db.query(
        "UPDATE quality_configuration SET configuration = $2::jsonb WHERE id = $1",
        [configId, JSON.stringify(originalConfiguration)],
      );
    }
    await db.end();
  }
});
