import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Pool } from "pg";
import { SearchRepository } from "../search/search.repository.js";
import { validateTarget } from "../../database/seed-lib.js";
import { IndexingRepository } from "./indexing.repository.js";
import { IndexingWorker } from "./indexing.worker.js";

test("S2-03: eventos transacionais, reindexação, falha, fencing, arquivamento e isolamento", {
  skip: !process.env.INDEX_TEST_DATABASE_URL,
}, async () => {
  const db = new Pool({ connectionString: validateTarget(process.env.INDEX_TEST_DATABASE_URL, "test") });
  const repository = new IndexingRepository(db);
  const [project, other, epic, feature, pbi, technology] = Array.from({ length: 6 }, () => randomUUID());
  let mode: "ok" | "fail" | "scope" = "ok";
  let requests = 0;
  const server = createServer(async (req, res) => {
    const buffers = [];
    for await (const part of req) buffers.push(part);
    const request = JSON.parse(Buffer.concat(buffers).toString());
    requests++;
    assert.equal(request.data.project_id, project);
    res.setHeader("Content-Type", "application/json");
    res.statusCode = mode === "fail" ? 503 : 200;
    res.end(JSON.stringify({
      entity_type: request.entity_type,
      content: request.data.title + " " + request.data.description,
      metadata: { project_id: mode === "scope" ? other : project },
      embedding: Array(1024).fill(0.1),
    }));
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const worker = new IndexingWorker(repository, "http://127.0.0.1:" + port);
  const event = async (id: string = pbi) => (await db.query("SELECT * FROM indice_evento WHERE projeto_id=$1 AND entidade_id=$2", [project, id])).rows[0];
  const chunks = async (id: string = pbi) => (await db.query("SELECT * FROM chunk WHERE projeto_id=$1 AND entidade_id=$2", [project, id])).rows;
  try {
    await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES($1,'Teste S2-03','Sintético','ativo'),($2,'Outro','Sintético','ativo')", [project, other]);
    await db.query("INSERT INTO epico(id,projeto_id,titulo,status) VALUES($1,$2,'Épico','rascunho')", [epic, project]);
    await db.query("INSERT INTO feature(id,epico_id,titulo,status) VALUES($1,$2,'Feature','rascunho')", [feature, epic]);
    await db.query("INSERT INTO pbi(id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que,status) VALUES($1::uuid,$2,$1::text,'Consultar acervo','PO','consultar','reutilizar','rascunho')", [pbi, feature]);
    assert.equal(await event(), undefined);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE pbi SET status='concluido' WHERE id=$1", [pbi]);
      assert.equal((await client.query("SELECT count(*)::int n FROM indice_evento WHERE projeto_id=$1", [project])).rows[0].n, 1);
      await client.query("ROLLBACK");
    } finally { client.release(); }
    assert.equal(await event(), undefined);

    await db.query("UPDATE pbi SET status='concluido' WHERE id=$1", [pbi]);
    const published = await event();
    assert.equal(published.payload.project_id, project);
    assert.equal(published.payload.level, "pbi");
    assert.equal(published.payload.status, "concluido");
    await worker.tick(project);
    assert.equal((await event()).status, "processado");
    assert.equal((await chunks()).length, 1);
    await worker.tick(project);
    assert.equal(requests, 1);
    const originalChunk = (await chunks())[0].id;

    await db.query("SELECT sincronizar_indice_projeto($1)", [project]);
    assert.equal((await event()).evento_id, published.evento_id);
    await repository.retry(project, published.evento_id);
    const queued = await event();
    await repository.retry(project, published.evento_id);
    assert.equal((await event()).updated_at.getTime(), queued.updated_at.getTime());
    await worker.tick(project);
    assert.equal((await chunks()).length, 1);
    assert.equal((await chunks())[0].id, originalChunk);

    await db.query("UPDATE pbi SET titulo='Consultar versão nova' WHERE id=$1", [pbi]);
    assert.equal((await chunks()).length, 0);
    mode = "fail"; await worker.tick(project);
    assert.equal((await event()).status, "falha");
    assert.equal((await event()).erro_codigo, "SERVICE_HTTP_ERROR");
    await repository.retry(project, (await event()).evento_id);
    mode = "scope"; await worker.tick(project);
    assert.equal((await event()).erro_codigo, "INVALID_SCOPE");
    assert.equal((await chunks()).length, 0);
    mode = "ok";
    await repository.retry(project, (await event()).evento_id);
    await worker.tick(project);
    assert.match((await chunks())[0].texto, /versão nova/);

    await db.query("INSERT INTO tecnologia(id,nome) VALUES($1::uuid,$1::text)", [technology]);
    await db.query("INSERT INTO entidade_tecnologia(entidade_tipo,entidade_id,tecnologia_id) VALUES('pbi',$1,$2)", [pbi, technology]);
    assert.deepEqual((await event()).payload.tecnologias_ids, [technology]);
    await db.query("INSERT INTO criterio_aceitacao(entidade_tipo,entidade_id,nome,dado,quando,entao,ordem) VALUES('pbi',$1,'Busca','Documento indexado','Consultar','Deve encontrar conteúdo',1)", [pbi]);
    assert.match((await event()).payload.acceptanceCriteria[0], /encontrar/);
    const beforeRename = (await event()).evento_id;
    await db.query("UPDATE criterio_aceitacao SET nome='Busca por origem' WHERE entidade_id=$1", [pbi]);
    assert.notEqual((await event()).evento_id, beforeRename);
    assert.match((await event()).payload.acceptanceCriteria[0], /Busca por origem/);
    await worker.tick(project);

    await repository.retry(project, (await event()).evento_id);
    const stale = (await repository.claim(project))!;
    assert.ok(stale);
    assert.equal(await repository.claim(project), null);
    await assert.rejects(repository.retry(project, stale.evento_id), /processamento/);
    await db.query("UPDATE pbi SET titulo='Consultar terceira versão' WHERE id=$1", [pbi]);
    await repository.finish(stale, { content: "Conteúdo atrasado", embedding: Array(1024).fill(0.1) });
    await repository.fail(stale, "PROCESSING_ERROR");
    assert.equal((await event()).status, "pendente");
    assert.equal((await chunks()).length, 0);
    await worker.tick(project);
    assert.match((await chunks())[0].texto, /terceira versão/);

    await db.query("UPDATE epico SET status='concluido' WHERE id=$1", [epic]);
    await db.query("UPDATE feature SET status='concluido' WHERE id=$1", [feature]);
    assert.equal((await event(epic)).payload.level, "epico");
    assert.equal((await event(feature)).payload.level, "feature");
    await worker.tick(project);
    await worker.tick(project);
    assert.equal((await chunks(epic)).length, 1);
    assert.equal((await chunks(feature)).length, 1);
    const decision = randomUUID();
    await db.query("INSERT INTO decisao(id,entidade_tipo,entidade_id,titulo,contexto,decisao,justificativa) VALUES($1,'feature',$2,'Usar fila','Concorrência','Fila persistida','Recuperação')", [decision, feature]);
    assert.equal((await event(decision)).payload.level, "feature");
    await worker.tick(project);
    assert.equal((await chunks(decision)).length, 1);
    assert.deepEqual((await repository.list(other)).items, []);
    await assert.rejects(repository.retry(other, (await event()).evento_id), /não encontrado/);
    assert.equal((await db.query("SELECT count(*)::int n FROM chunk WHERE projeto_id=$1", [other])).rows[0].n, 0);

    const search = new SearchRepository(db);
    const searchProject = (id: string) => search.hybridSearch({ query: "versão", projectId: id, limit: 20 }, Array(1024).fill(0.1), 0.5);
    assert.ok((await searchProject(project)).some(row => row.entity_id === pbi));
    assert.equal((await searchProject(other)).length, 0);
    await db.query("UPDATE decisao SET decisao='Fila revisada' WHERE id=$1", [decision]);
    assert.match((await event(decision)).payload.decisionsAndRationale, /revisada/);
    await worker.tick(project);
    const inFlight = (await event()).evento_id;
    await repository.retry(project, inFlight);
    const beforeArchive = (await repository.claim(project))!;
    await db.query("UPDATE epico SET status='arquivado' WHERE id=$1", [epic]);
    assert.equal((await chunks()).length, 0);
    assert.equal((await chunks(decision)).length, 0);
    assert.equal((await searchProject(project)).length, 0);
    await repository.finish(beforeArchive, { content: "Arquivado", embedding: Array(1024).fill(0.1) });
    assert.equal((await chunks()).length, 0);
    await worker.tick(project); await worker.tick(project);
    assert.equal((await event()).operacao, "remover");

    await db.query("UPDATE epico SET status='rascunho' WHERE id=$1", [epic]);
    const expired = (await repository.claim(project))!;
    await db.query("UPDATE indice_evento SET tentativas=5,bloqueado_ate=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE evento_id=$1", [expired.evento_id]);
    await repository.claim(project);
    assert.equal((await event(expired.entidade_id)).erro_codigo, "ATTEMPTS_EXHAUSTED");
    await repository.retry(project, expired.evento_id);
    await db.query("UPDATE projeto SET status='arquivado' WHERE id=$1", [project]);
    assert.equal((await db.query("SELECT count(*)::int n FROM chunk WHERE projeto_id=$1", [project])).rows[0].n, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r()));
    await db.query("DELETE FROM projeto WHERE id=ANY($1::uuid[])", [[project, other]]);
    await db.query("DELETE FROM tecnologia WHERE id=$1", [technology]);
    await db.end();
  }
});


test("S2-03 HTTP: autenticação, escopo, observabilidade e nova tentativa", {
  skip: !process.env.INDEX_TEST_DATABASE_URL,
}, async () => {
  const { pool } = await import("../../database/db.js");
  const { app } = await import("../../app.js");
  const { sessionService } = await import("../auth/session.service.js");
  const [project, other, epic, admin, developer] = Array.from({ length: 5 }, () => randomUUID());
  const api = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => api.once("listening", r));
  const base = "http://127.0.0.1:" + (api.address() as { port: number }).port;
  try {
    await pool.query("INSERT INTO projeto(id,nome,cliente,status) VALUES($1,'HTTP','Teste','ativo'),($2,'Outro','Teste','ativo')", [project, other]);
    await pool.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES($1::uuid,'Admin',$1::text||'@example.test','inutilizado','admin'),($2::uuid,'Dev',$2::text||'@example.test','inutilizado','dev')", [admin, developer]);
    const adminSession = await sessionService.createSession(admin);
    const devSession = await sessionService.createSession(developer);
    const headers = { Authorization: "Bearer " + adminSession.token };
    const path = "/api/v1/projects/" + project + "/index-events";
    assert.equal((await fetch(base + path)).status, 401);
    assert.equal((await fetch(base + path, { headers: { Authorization: "Bearer " + devSession.token } })).status, 404);
    await pool.query("INSERT INTO epico(id,projeto_id,titulo,descricao,objetivo,escopo_macro,resultado_esperado,status) VALUES($1,$2,'Consultar índice','Descrição','Objetivo','Escopo','Resultado','rascunho')", [epic, project]);
    assert.equal((await pool.query("SELECT count(*)::int n FROM indice_evento WHERE projeto_id=$1", [project])).rows[0].n, 0);
    const completePath = base + "/api/v1/epics/" + epic + "/complete";
    assert.equal((await fetch(completePath, { method: "PATCH", headers })).status, 400);
    assert.equal((await pool.query("SELECT count(*)::int n FROM indice_evento WHERE projeto_id=$1", [project])).rows[0].n, 0);
    const criterion = await fetch(base + "/api/v1/criteria", {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ entidade_tipo: "epico", entidade_id: epic, texto: "Encontrar origem" }),
    });
    assert.equal(criterion.status, 201);
    assert.equal((await fetch(completePath, { method: "PATCH", headers })).status, 200);
    const listing = await fetch(base + path, { headers });
    assert.equal(listing.status, 200);
    const body = await listing.json() as { items: { evento_id: string; status: string; payload?: unknown }[] };
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].status, "pendente");
    assert.equal(body.items[0].payload, undefined);
    const developerProfile = randomUUID();
    await pool.query("INSERT INTO desenvolvedor(id,usuario_id) VALUES($1,$2)", [developerProfile, developer]);
    await pool.query("INSERT INTO alocacao(desenvolvedor_id,projeto_id,papel) VALUES($1,$2,'Teste')", [developerProfile, project]);
    const devHeaders = { Authorization: "Bearer " + devSession.token };
    assert.equal((await fetch(base + path, { headers: devHeaders })).status, 200);
    assert.equal((await fetch(base + path + "/" + body.items[0].evento_id + "/reprocess", { method: "POST", headers: devHeaders })).status, 403);
    const eventId = body.items[0].evento_id;
    assert.equal((await fetch(completePath, { method: "PATCH", headers })).status, 200);
    assert.equal((await pool.query("SELECT evento_id FROM indice_evento WHERE projeto_id=$1", [project])).rows[0].evento_id, eventId);
    assert.equal((await fetch(base + path + "/" + eventId + "/reprocess", { method: "POST", headers })).status, 202);
    assert.equal((await fetch(base + "/api/v1/projects/" + other + "/index-events/" + eventId + "/reprocess", { method: "POST", headers })).status, 404);
    assert.equal((await fetch(base + path + "/invalido/reprocess", { method: "POST", headers })).status, 400);
    const savedDecision = await fetch(base + "/api/v1/epics/" + epic + "/decisions", {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: "Usar fila", contexto: "Concorrência", decisao: "Fila persistida", justificativa: "Recuperação" }),
    });
    assert.equal(savedDecision.status, 201);
    const saved = await savedDecision.json() as { id: string };
    const decisionEvent = (await pool.query("SELECT payload FROM indice_evento WHERE entidade_tipo='decisao' AND entidade_id=$1", [saved.id])).rows[0];
    assert.equal(decisionEvent.payload.project_id, project);
    assert.equal(decisionEvent.payload.level, "epico");
    await pool.query("UPDATE projeto SET status='arquivado' WHERE id=$1", [project]);
    const current = (await pool.query("SELECT evento_id FROM indice_evento WHERE projeto_id=$1", [project])).rows[0].evento_id;
    assert.equal((await fetch(base + path + "/" + current + "/reprocess", { method: "POST", headers })).status, 409);
  } finally {
    api.closeAllConnections();
    await new Promise<void>(r => api.close(() => r()));
    await pool.query("DELETE FROM projeto WHERE id=ANY($1::uuid[])", [[project, other]]);
    await pool.query("DELETE FROM usuario WHERE id=ANY($1::uuid[])", [[admin, developer]]);
    await pool.end();
  }
});

test("S2-03 regressão: excluir ancestral em rascunho retira decisões órfãs do índice", {
  skip: !process.env.INDEX_TEST_DATABASE_URL,
}, async () => {
  const db = new Pool({ connectionString: validateTarget(process.env.INDEX_TEST_DATABASE_URL, "test") });
  const repository = new IndexingRepository(db);
  const [project, epic, feature, decision] = Array.from({ length: 4 }, () => randomUUID());
  try {
    await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES($1,'Regressão','Teste','ativo')", [project]);
    await db.query("INSERT INTO epico(id,projeto_id,titulo,status) VALUES($1,$2,'Épico','rascunho')", [epic, project]);
    await db.query("INSERT INTO feature(id,epico_id,titulo,status) VALUES($1,$2,'Feature','rascunho')", [feature, epic]);
    await db.query("INSERT INTO decisao(id,entidade_tipo,entidade_id,titulo,contexto,decisao,justificativa) VALUES($1,'feature',$2,'Fila','Contexto','Usar fila','Recuperação')", [decision, feature]);
    const job = (await repository.claim(project))!;
    await repository.finish(job, { content: "Usar fila", embedding: Array(1024).fill(0.1) });
    assert.equal((await db.query("SELECT count(*)::int n FROM chunk WHERE projeto_id=$1", [project])).rows[0].n, 1);
    await db.query("DELETE FROM feature WHERE id=$1", [feature]);
    assert.equal((await db.query("SELECT count(*)::int n FROM chunk WHERE projeto_id=$1", [project])).rows[0].n, 0);
    assert.equal((await db.query("SELECT operacao FROM indice_evento WHERE projeto_id=$1", [project])).rows[0].operacao, "remover");
  } finally {
    await db.query("DELETE FROM projeto WHERE id=$1", [project]);
    await db.end();
  }
});

test("S2-03 regressão: reserva expirada enquanto aguarda lock não grava resposta", {
  skip: !process.env.INDEX_TEST_DATABASE_URL,
  timeout: 10000,
}, async () => {
  const db = new Pool({
    connectionString: validateTarget(process.env.INDEX_TEST_DATABASE_URL, "test"),
    application_name: "s203-lease-regression",
  });
  const repository = new IndexingRepository(db);
  const [project, epic] = [randomUUID(), randomUUID()];
  const blocker = await db.connect();
  let finishing: Promise<void> | undefined;
  try {
    await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES($1,'Reserva','Teste','ativo')", [project]);
    await db.query("INSERT INTO epico(id,projeto_id,titulo,status) VALUES($1,$2,'Épico','concluido')", [epic, project]);
    const event = (await repository.claim(project))!;
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM projeto WHERE id=$1 FOR UPDATE", [project]);
    finishing = repository.finish(event, { content: "Resposta atrasada", embedding: Array(1024).fill(0.1) });
    let waiting = false;
    for (let i = 0; i < 50; i++) {
      const activity = await db.query("SELECT 1 FROM pg_stat_activity WHERE application_name='s203-lease-regression' AND wait_event_type='Lock'");
      if (activity.rowCount) { waiting = true; break; }
      await new Promise(r => setTimeout(r, 10));
    }
    assert.ok(waiting, "A conclusão deve estar esperando o lock do projeto.");
    await db.query("SELECT pg_sleep(0.05)");
    await db.query("UPDATE indice_evento SET bloqueado_ate=clock_timestamp()-INTERVAL '1 millisecond' WHERE evento_id=$1", [event.evento_id]);
    await blocker.query("COMMIT");
    await finishing;
    assert.equal((await db.query("SELECT count(*)::int n FROM chunk WHERE projeto_id=$1", [project])).rows[0].n, 0);
    assert.equal((await db.query("SELECT status FROM indice_evento WHERE evento_id=$1", [event.evento_id])).rows[0].status, "processando");
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await finishing;
    await db.query("DELETE FROM projeto WHERE id=$1", [project]);
    await db.end();
  }
});
