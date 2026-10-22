import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { DocumentsRepository } from "./documents.repository.js";
import { AdminRepository } from "../admin/admin.repository.js";

test("Callback de chunks autentica o serviço e preserva as guardas de documentos", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async t => {
  const db = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const { app } = await import("../../app.js");
  const { pool } = await import("../../database/db.js");
  const { env } = await import("../../config/env.js");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + (server.address() as { port: number }).port + "/api/v1/projects/";
  const [project, otherProject, document, user] = Array.from({ length: 4 }, () => randomUUID());
  const token = env.DOCUMENT_INGESTION_TOKEN || "sinapse-dev-document-ingestion-token-2026";
  const payload = { processamento_lease_id: randomUUID() as string, chunks: [{ chunk_index: 0, content: "Texto de teste", embedding: Array(1024).fill(0.1) }] };
  const documents = new DocumentsRepository(db);
  const claim = async () => {
    const claimed = (await documents.claimPendingIngestion(100)).find(row => row.id === document);
    assert.ok(claimed);
    return claimed.processamento_lease_id;
  };
  const endpoint = (projectId = project) => base + projectId + "/documents/" + document + "/chunks";
  const send = (url = endpoint(), credential: string | null = token, body: unknown = payload) => fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(credential ? { Authorization: "Bearer " + credential } : {}) },
    body: JSON.stringify(body),
  });
  try {
    await db.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES ($1,'QA',$2,'h','admin')", [user, user + "@chunks.test"]);
    for (const id of [project, otherProject]) {
      await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES ($1,$2,'QA','ativo')", [id, id]);
    }
    await db.query("INSERT INTO documento(id,projeto_id,nome,caminho) VALUES ($1,$2,'QA.txt','qa.txt')", [document, project]);
    payload.processamento_lease_id = await claim();
    await t.test("recusa token ausente ou inválido sem gravar chunks", async () => {
      for (const credential of [null, "token-invalido"]) {
        const response = await send(endpoint(), credential);
        assert.equal(response.status, 401);
        assert.equal((await response.json() as { code: string }).code, "INGEST_TOKEN_INVALID");
      }
      assert.equal((await db.query("SELECT count(*)::int AS n FROM chunk WHERE entidade_id=$1", [document])).rows[0].n, 0);
    });
    await t.test("token sozinho não substitui a reserva de execução", async () => {
      assert.equal((await send(endpoint(), token, { chunks: payload.chunks })).status, 400);
      assert.equal((await send(endpoint(), token, { ...payload, processamento_lease_id: "invalida" })).status, 400);
      assert.equal((await send(endpoint(), token, { ...payload, processamento_lease_id: randomUUID() })).status, 409);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM chunk WHERE entidade_id=$1", [document])).rows[0].n, 0);
    });
    await t.test("token e reserva válidos funcionam sem sessão e repetir o envio não duplica chunks", async () => {
      for (let i = 0; i < 2; i++) {
        const response = await send();
        assert.equal(response.status, 200, await response.text());
      }
      assert.equal((await db.query("SELECT count(*)::int AS n FROM chunk WHERE entidade_id=$1", [document])).rows[0].n, 1);
      assert.equal((await db.query("SELECT status_processamento FROM documento WHERE id=$1", [document])).rows[0].status_processamento, "processado");
    });
    await t.test("não permite associar documento ao projeto errado", async () => {
      const response = await send(endpoint(otherProject));
      assert.equal(response.status, 404);
      assert.equal((await db.query("SELECT projeto_id FROM chunk WHERE entidade_id=$1", [document])).rows[0].projeto_id, project);
    });
    await t.test("expurgo invalida callback antigo; nova reserva funciona e respostas antigas não sobrescrevem", async () => {
      const oldLease = payload.processamento_lease_id;
      await new AdminRepository(db).purgeProjectContext(project!, project!, user!);
      assert.equal((await send()).status, 409);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM chunk WHERE entidade_id=$1", [document])).rows[0].n, 0);
      assert.equal((await db.query("SELECT status_processamento FROM documento WHERE id=$1", [document])).rows[0].status_processamento, "falha");
      assert.equal(await documents.retryIngestion(project!, document!), true);
      assert.equal((await send()).status, 409);
      const expiredLease = await claim();
      assert.notEqual(expiredLease, oldLease);
      assert.equal((await send()).status, 409);
      payload.processamento_lease_id = expiredLease;
      await db.query("UPDATE documento SET processamento_bloqueado_ate=clock_timestamp()-INTERVAL '1 second' WHERE id=$1", [document]);
      assert.equal((await send()).status, 409);
      const freshLease = await claim();
      assert.notEqual(freshLease, expiredLease);
      payload.processamento_lease_id = freshLease;
      payload.chunks[0]!.content = "Conteúdo da nova tentativa";
      assert.equal((await send()).status, 200);
      const saved = (await db.query("SELECT id,texto FROM chunk WHERE entidade_id=$1", [document])).rows;
      payload.processamento_lease_id = oldLease;
      payload.chunks[0]!.content = "Resposta antiga";
      assert.equal((await send()).status, 409);
      payload.processamento_lease_id = expiredLease;
      assert.equal((await send()).status, 409);
      assert.deepEqual((await db.query("SELECT id,texto FROM chunk WHERE entidade_id=$1", [document])).rows, saved);
      payload.processamento_lease_id = freshLease;
      assert.equal((await send()).status, 200);
      assert.deepEqual((await db.query("SELECT id,texto FROM chunk WHERE entidade_id=$1", [document])).rows, saved);
    });
    await t.test("projeto arquivado continua recusando escrita", async () => {
      await db.query("UPDATE projeto SET status='arquivado' WHERE id=$1", [project]);
      const response = await send();
      assert.equal(response.status, 409);
      assert.equal((await response.json() as { code: string }).code, "ARCHIVE_CONFLICT");
    });
    await t.test("token de serviço não concede acesso às rotas de usuário", async () => {
      for (const path of [base + project + "/documents", base + project + "/documents/" + document + "/chunks/extra"]) {
        const response = await fetch(path, { headers: { Authorization: "Bearer " + token } });
        assert.equal(response.status, 401);
        assert.equal((await response.json() as { code: string }).code, "UNAUTHORIZED");
      }
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.query("DELETE FROM projeto WHERE id=ANY($1::uuid[])", [[project, otherProject]]);
    await db.query("DELETE FROM usuario WHERE id=$1", [user]);
    await db.end();
    await pool.end();
  }
});
