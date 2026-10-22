import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";

test("Busca e leituras relacionadas respeitam o acesso ao projeto", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async t => {
  let embeddingCalls = 0;
  const model = createServer(async (req, res) => {
    embeddingCalls++;
    for await (const _ of req) { /* Consome a requisição local de teste. */ }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ embedding: Array(1024).fill(0.1) }));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  const originalAiUrl = process.env.AI_SERVICE_URL;
  process.env.AI_SERVICE_URL = "http://127.0.0.1:" + (model.address() as { port: number }).port;
  const { app } = await import("../../app.js");
  const { pool } = await import("../../database/db.js");
  const { sessionService } = await import("../auth/session.service.js");
  const db = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const [projectA, projectB, document, chunk, epic, feature, pbi] = Array.from({ length: 7 }, () => randomUUID());
  const users = Array.from({ length: 6 }, () => randomUUID());
  const tokens: string[] = [];
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + (server.address() as { port: number }).port + "/api/v1";
  const request = (path: string, token?: string, method = "GET", body?: unknown) => fetch(base + path, {
    method, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const search = (project: string, alias = "projeto_id") => "/search?q=confidencial&" + alias + "=" + project;
  try {
    for (const project of [projectA, projectB]) {
      await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES ($1,$2,'QA','ativo')", [project, project]);
    }
    for (const [i, user] of users.entries()) {
      await db.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES ($1,'QA',$2,'h',$3)", [user, user + "@search.test", i === 0 ? "admin" : i === 1 ? "po" : "dev"]);
      if (i >= 2) {
        const developer = randomUUID();
        await db.query("INSERT INTO desenvolvedor(id,usuario_id) VALUES ($1,$2)", [developer, user]);
        const start = i === 5 ? new Date(Date.now() + 86400000) : new Date(Date.now() - 86400000);
        const end = i === 4 ? new Date(Date.now() - 1000) : null;
        await db.query("INSERT INTO alocacao(desenvolvedor_id,projeto_id,data_inicio,data_fim) VALUES ($1,$2,$3,$4)",
          [developer, i === 3 ? projectA : projectB, start, end]);
      }
      tokens.push((await sessionService.createSession(user)).token);
    }
    await db.query("INSERT INTO epico(id,projeto_id,titulo) VALUES ($1,$2,'Épico restrito')", [epic, projectB]);
    await db.query("INSERT INTO feature(id,epico_id,titulo) VALUES ($1,$2,'Feature restrita')", [feature, epic]);
    await db.query("INSERT INTO pbi(id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que) VALUES ($1,$2,$3,'Consultar confidencial','PO','x','y')", [pbi, feature, pbi]);
    await db.query("INSERT INTO documento(id,projeto_id,nome,caminho,status_processamento) VALUES ($1,$2,'Restrito.txt','qa.txt','processado')", [document, projectB]);
    await db.query("INSERT INTO chunk(id,projeto_id,entidade_tipo,entidade_id,texto,metadados_json,embedding) VALUES ($1,$2,'documento',$3,'Conteúdo confidencial',$4::jsonb,$5::vector)",
      [chunk, projectB, document, JSON.stringify({ chunk_index: 0 }), JSON.stringify(Array(1024).fill(0.1))]);
    await t.test("admin, PO e desenvolvedor alocado recuperam o documento", async () => {
      for (const token of tokens.slice(0, 3)) {
        const response = await request(search(projectB), token);
        assert.equal(response.status, 200);
        const result = await response.json() as { items: Array<{ id: string }> };
        assert.ok(result.items.some(row => row.id === chunk));
      }
    });
    await t.test("sem alocação, alocação encerrada e futura não consultam embeddings nem conteúdo", async () => {
      const previous = embeddingCalls;
      for (const token of tokens.slice(3)) {
        for (const alias of ["projeto_id", "projectId"]) {
          const response = await request(search(projectB, alias), token);
          assert.equal(response.status, 404);
          assert.doesNotMatch(await response.text(), /Conteúdo confidencial/);
        }
      }
      assert.equal(embeddingCalls, previous);
    });
    await t.test("desenvolvedor lê análises, mas não inicia nem altera uma análise do PO", async () => {
      const path = "/projects/" + projectB + "/repo-analyses";
      const started = await request(path, tokens[1], "POST", { repositorio_url: "https://github.com/example/repository" });
      assert.equal(started.status, 201);
      const analysis = await started.json() as { id: string };
      assert.equal((await request(path, tokens[2], "POST", { repositorio_url: "https://github.com/example/repository" })).status, 403);
      for (const action of ["pause", "resume", "cancel"]) {
        assert.equal((await request(path + "/" + analysis.id + "/" + action, tokens[2], "POST")).status, 403);
      }
      assert.equal((await db.query("SELECT status FROM analise_repositorio WHERE id=$1", [analysis.id])).rows[0].status, "iniciado");
      assert.equal((await db.query("SELECT count(*)::int AS n FROM analise_repositorio WHERE projeto_id=$1", [projectB])).rows[0].n, 1);
      assert.equal((await request(path, tokens[2])).status, 200);
      assert.equal((await request(path + "/" + analysis.id, tokens[2])).status, 200);
      assert.equal((await request(path + "/" + analysis.id + "/cancel", tokens[1], "POST")).status, 200);
    });
    await t.test("retirar a alocação revoga a busca na mesma sessão", async () => {
      await db.query("UPDATE alocacao SET data_fim=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE desenvolvedor_id IN (SELECT id FROM desenvolvedor WHERE usuario_id=$1)", [users[2]]);
      assert.equal((await request(search(projectB), tokens[2])).status, 404);
    });
    await t.test("sessão ausente, projeto inexistente e parâmetro inválido são recusados", async () => {
      assert.equal((await request(search(projectB))).status, 401);
      assert.equal((await request(search(randomUUID()), tokens[0])).status, 404);
      assert.equal((await request(search("invalido"), tokens[0])).status, 400);
    });
    await t.test("documentos, histórico, qualidade e rotas legadas também bloqueiam outro projeto", async () => {
      for (const path of [
        "/projects/" + projectB,
        "/projects/" + projectB + "/documents",
        "/projects/" + projectB + "/documents/" + document + "/excerpts?chunk_id=" + chunk,
        "/audit/pbi/" + pbi + "/history",
        "/quality/pbis/" + pbi + "/quality",
        "/epicos/" + epic,
        "/projects/" + projectB + "/epicos",
      ]) {
        assert.equal((await request(path, tokens[3])).status, 404, path);
      }
      assert.equal((await request("/chat/conversations", tokens[3], "POST", { projeto_id: projectB })).status, 404);
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    model.closeAllConnections();
    await new Promise<void>(resolve => model.close(() => resolve()));
    await db.query("DELETE FROM projeto WHERE id=ANY($1::uuid[])", [[projectA, projectB]]);
    await db.query("DELETE FROM usuario WHERE id=ANY($1::uuid[])", [users]);
    await db.end();
    await pool.end();
    if (originalAiUrl === undefined) delete process.env.AI_SERVICE_URL;
    else process.env.AI_SERVICE_URL = originalAiUrl;
  }
});
