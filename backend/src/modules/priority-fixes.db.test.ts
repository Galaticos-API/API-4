import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../database/seed-lib.js";
import { PbisRepository } from "./pbis/pbis.repository.js";
import { PbisService } from "./pbis/pbis.service.js";
import { EpicsRepository } from "./epics/epics.repository.js";
import { FeaturesRepository } from "./features/features.repository.js";
import { CriteriaRepository } from "./criteria/criteria.repository.js";
import { QualityService, DatabaseQualityRuleConfigurationProvider } from "./quality/quality.service.js";
import { QualityConfigurationRepository } from "./quality/quality.configuration.repository.js";
import { AdminRepository } from "./admin/admin.repository.js";
import { lockHierarchy } from "./projects/hierarchy-archive.js";
import { ValidationError, NotFoundError } from "../shared/errors.js";
import { ArchiveConflict } from "./projects/archive.types.js";
import { ProjectsRepository } from "./projects/projects.repository.js";

const target = process.env.ARCHIVE_TEST_DATABASE_URL;

test("correções prioritárias no PostgreSQL: transações, conclusão e demonstração", { skip: !target, timeout: 30000 }, async t => {
  const connectionString = validateTarget(target, "test");
  const applicationName = "priority_" + randomUUID();
  const db = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 1000, application_name: applicationName });
  const control = new Pool({ connectionString, max: 3 });
  const [project, otherProject, epic, feature, pbi, criterion, user] = Array.from({ length: 7 }, randomUUID);
  const pbis = new PbisRepository(db);
  const epics = new EpicsRepository(db);
  const features = new FeaturesRepository(db);
  const config = new QualityConfigurationRepository(db);
  const quality = new QualityService(new CriteriaRepository(db), pbis, new DatabaseQualityRuleConfigurationProvider(config));
  const service = new PbisService(pbis, features, quality, config);
  const admin = new AdminRepository(db);
  async function waitForLock() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await control.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [applicationName]);
      if (result.rowCount) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("A operação não aguardou o lock da transação concorrente");
  }
  try {
    await db.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES ($1,'Admin teste',$2,'hash','admin')", [user, user + "@test.local"]);
    await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES ($1::uuid,$1::text,'Teste','ativo'),($2::uuid,$2::text,'Teste','ativo')", [project, otherProject]);
    await db.query("INSERT INTO epico(id,projeto_id,titulo,status) VALUES ($1,$2,'Cadastrar acesso','rascunho')", [epic, project]);
    await db.query("INSERT INTO feature(id,epico_id,titulo,status) VALUES ($1,$2,'Cadastrar acesso','rascunho')", [feature, epic]);
    await db.query("INSERT INTO pbi(id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que,status) VALUES ($1::uuid,$2,$1::text,'Cadastrar acesso','PO','cadastrar acesso','organizar usuários','rascunho')", [pbi, feature]);
    await db.query("INSERT INTO criterio_aceitacao(id,entidade_tipo,entidade_id,nome,dado,quando,entao,ordem) VALUES ($1,'pbi',$2,'Acesso','usuário válido','confirmar','acesso criado',1)", [criterion, pbi]);

    await t.test("alterações em outro projeto não esperam o projeto bloqueado", async () => {
      const blocker = await control.connect();
      let updating: Promise<unknown> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await blocker.query("BEGIN");
        await lockHierarchy(blocker, "projeto", project);
        updating = new AdminRepository(db).insertDemoChunks(otherProject, user);
        const completed = await Promise.race([updating.then(() => true), new Promise<boolean>(resolve => { timer=setTimeout(() => resolve(false), 1500); })]);
        assert.equal(completed, true, "outro projeto ficou bloqueado");
      } finally {
        clearTimeout(timer);
        await blocker.query("ROLLBACK"); blocker.release();
        await updating;
        await db.query("DELETE FROM chunk WHERE projeto_id=$1", [otherProject]);
        await db.query("DELETE FROM auditoria WHERE entidade_id=$1", [otherProject]);
      }
    });

    await db.query("UPDATE epico SET descricao='Descrição',objetivo='Objetivo',escopo_macro='Escopo',resultado_esperado='Resultado' WHERE id=$1",[epic]);
    await db.query("UPDATE feature SET descricao='Descrição',objetivo='Objetivo' WHERE id=$1",[feature]);
    await db.query("INSERT INTO criterio_aceitacao(entidade_tipo,entidade_id,texto,ordem) VALUES ('epico',$1,'Critério do épico',1)",[epic]);

    await t.test("conclusões revalidam os campos após aguardar o bloqueio", async () => {
      for (const [entity, id, repository] of [["epico",epic,epics],["feature",feature,features]] as const) {
        const blocker = await control.connect();
        let pending: Promise<void> | undefined;
        try {
          await blocker.query("BEGIN");
          await lockHierarchy(blocker,"projeto",project);
          pending = assert.rejects(repository.markConcluded(id,user),ValidationError);
          await waitForLock();
          await blocker.query("UPDATE " + entity + " SET objetivo=NULL WHERE id=$1",[id]);
          await blocker.query("COMMIT");
          await pending;
          assert.equal((await repository.findById(id))?.status,"rascunho");
        } finally {
          await blocker.query("ROLLBACK"); blocker.release();
          await pending;
          await db.query("UPDATE " + entity + " SET objetivo='Objetivo' WHERE id=$1",[id]);
        }
      }
    });

    await t.test("épico revalida o último critério após aguardar o bloqueio", async () => {
      const blocker = await control.connect();
      let pending: Promise<void> | undefined;
      try {
        await blocker.query("BEGIN");
        await lockHierarchy(blocker,"projeto",project);
        pending = assert.rejects(epics.markConcluded(epic,user),ValidationError);
        await waitForLock();
        await blocker.query("DELETE FROM criterio_aceitacao WHERE entidade_tipo='epico' AND entidade_id=$1",[epic]);
        await blocker.query("COMMIT");
        await pending;
        assert.equal((await epics.findById(epic))?.status,"rascunho");
      } finally {
        await blocker.query("ROLLBACK"); blocker.release();
        await pending;
        await db.query("INSERT INTO criterio_aceitacao(entidade_tipo,entidade_id,texto,ordem) VALUES ('epico',$1,'Critério restaurado',1)",[epic]);
      }
    });

    await t.test("updates e conclusões funcionam com pool de uma única conexão", async () => {
      assert.equal((await epics.update(epic, { titulo: "Cadastrar clientes" }, user))?.titulo, "Cadastrar clientes");
      assert.equal((await features.update(feature, { titulo: "Cadastrar usuários" }, user))?.titulo, "Cadastrar usuários");
      assert.equal((await pbis.update(pbi, { titulo: "Cadastrar usuários" }, user))?.titulo, "Cadastrar usuários");
      assert.equal((await epics.markConcluded(epic, user))?.status, "concluido");
      assert.equal((await features.markConcluded(feature, user))?.status, "concluido");
      assert.equal((await service.complete(pbi, user)).status, "concluido");
      await service.complete(pbi, user);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM auditoria WHERE entidade_id=$1 AND acao='CONCLUIR_PBI'", [pbi])).rows[0].n, 1);
    });

    await t.test("campos obrigatórios não podem ser apagados após conclusão", async () => {
      for (const value of [null, "", "   "]) {
        await assert.rejects(features.update(feature,{objetivo:value,justificativa:"Teste"},user),ValidationError);
        await assert.rejects(features.update(feature,{descricao:value,justificativa:"Teste"},user),ValidationError);
        await assert.rejects(epics.update(epic,{objetivo:value,justificativa:"Teste"},user),ValidationError);
      }
      assert.equal((await features.findById(feature))?.objetivo,"Objetivo");
    });

    await t.test("falha de auditoria reverte atualização e libera a conexão", async () => {
      const before = await pbis.findById(pbi);
      await assert.rejects(pbis.update(pbi, { titulo: "Cadastrar outro acesso", justificativa: "Teste de rollback" }, randomUUID()));
      assert.equal((await pbis.findById(pbi))?.titulo, before?.titulo);
    });

    await t.test("conclusão revalida critérios alterados enquanto espera o lock", async () => {
      await db.query("UPDATE pbi SET status='rascunho' WHERE id=$1", [pbi]);
      const blocker = await control.connect();
      let pending: Promise<void> | undefined;
      try {
        await blocker.query("BEGIN");
        await lockHierarchy(blocker, "projeto", project);
        pending = assert.rejects(service.complete(pbi, user), ValidationError);
        await waitForLock();
        await blocker.query("DELETE FROM criterio_aceitacao WHERE id=$1", [criterion]);
        await blocker.query("COMMIT");
        await pending;
        assert.equal((await pbis.findById(pbi))?.status, "rascunho");
        assert.equal((await db.query("SELECT count(*)::int AS n FROM auditoria WHERE entidade_id=$1 AND acao='CONCLUIR_PBI'", [pbi])).rows[0].n, 1);
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
        await pending?.catch(() => undefined);
      }
    });

    await t.test("configuração de qualidade fica bloqueada até o commit", async () => {
      await db.query("INSERT INTO criterio_aceitacao(id,entidade_tipo,entidade_id,nome,dado,quando,entao,ordem) VALUES ($1,'pbi',$2,'Acesso','usuário válido','confirmar','acesso criado',1)", [criterion, pbi]);
      let release!: () => void;
      let validated!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const ready = new Promise<void>(resolve => { validated = resolve; });
      const completing = pbis.markConcluded(pbi, async client => {
        await quality.validatePbi(pbi, client);
        validated();
        await gate;
      }, user);
      try {
        await Promise.race([ready, completing.then(() => { throw new Error("A validação não foi executada"); })]);
        const editor = await control.connect();
        try {
          await editor.query("BEGIN");
          await editor.query("SET LOCAL lock_timeout='100ms'");
          await assert.rejects(editor.query("UPDATE quality_configuration SET version=version+1"), (error: unknown) => (error as { code: string }).code === "55P03");
        } finally { await editor.query("ROLLBACK"); editor.release(); }
      } finally { release(); await completing; }
    });

    await t.test("projetos preservam CRUD, snapshot e arquivamento com uma conexão", async () => {
      const projects = new ProjectsRepository(db);
      const created = await projects.create({ nome: randomUUID(), cliente: "Teste", status: "ativo" }, user);
      try {
        assert.equal((await projects.update(created.id, { nome: "Projeto organizado" }, user))?.nome, "Projeto organizado");
        await assert.rejects(projects.update(created.id, { nome: "Não persistir" }, randomUUID()));
        assert.equal((await projects.findById(created.id))?.nome, "Projeto organizado");
        assert.equal((await projects.findBacklogTree(created.id))?.project.id, created.id);
        const impact = (await projects.archiveImpact(created.id))!;
        assert.equal((await projects.archive(created.id, user, "Encerrar teste", impact))?.status, "arquivado");
        assert.equal((await projects.archive(created.id, user))?.status, "arquivado");
        assert.equal(await projects.update(randomUUID(), { nome: "Ausente" }, user), null);
        assert.equal(await projects.archive(randomUUID(), user), null);
        assert.equal(await projects.findBacklogTree(randomUUID()), null);
      } finally {
        await db.query("DELETE FROM auditoria WHERE entidade_id=$1", [created.id]);
        await db.query("DELETE FROM projeto WHERE id=$1", [created.id]);
      }
    });

    await t.test("carga explícita é idempotente, auditada e não conta exemplos como vetores", async () => {
      const before = await admin.counts();
      const peer = new AdminRepository(control);
      const inserted = await Promise.all([admin.insertDemoChunks(project, user), peer.insertDemoChunks(project, user)]);
      assert.deepEqual(inserted.sort(), [0, 2]);
      assert.equal(await admin.insertDemoChunks(project, user), 0);
      assert.equal((await db.query("SELECT count(*)::int n FROM chunk WHERE projeto_id=$1", [project])).rows[0].n, 2);
      assert.equal((await db.query("SELECT count(*)::int n FROM chunk WHERE projeto_id=$1", [otherProject])).rows[0].n, 0);
      assert.equal((await admin.counts()).chunksIndexados, before.chunksIndexados);
      assert.equal((await db.query("SELECT count(*)::int n FROM auditoria WHERE entidade_id=$1 AND acao='CARREGAR_DEMONSTRACAO'", [project])).rows[0].n, 1);
      await assert.rejects(admin.insertDemoChunks(otherProject, randomUUID()));
      assert.equal((await db.query("SELECT count(*)::int n FROM chunk WHERE projeto_id=$1", [otherProject])).rows[0].n, 0);
      await db.query("UPDATE projeto SET status='arquivado' WHERE id=$1", [otherProject]);
      await assert.rejects(admin.insertDemoChunks(otherProject, user), ArchiveConflict);
      await assert.rejects(admin.insertDemoChunks(randomUUID(), user), NotFoundError);
    });
  } finally {
    await control.query("DELETE FROM auditoria WHERE usuario_id=$1", [user]);
    await control.query("DELETE FROM projeto WHERE id=ANY($1::uuid[])", [[project, otherProject]]);
    await control.query("DELETE FROM usuario WHERE id=$1", [user]);
    await db.end();
    await control.end();
  }
});
