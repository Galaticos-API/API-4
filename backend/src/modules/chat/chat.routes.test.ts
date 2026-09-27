import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { errorHandler } from "../../middleware/errorHandler.js";
import { createChatRouter } from "./chat.routes.js";
import { ChatService } from "./chat.service.js";
import { ANA, BRUNO, FakeAssistant, FakeChatRepository, PROJECT_A } from "./chat.fakes.js";

let server: Server;
let baseUrl: string;
const repository = new FakeChatRepository();
const assistant = new FakeAssistant();

before(() => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/chat", createChatRouter(new ChatService(repository, assistant), (req, res, next) => {
    const user = req.headers["x-test-user"];
    if (typeof user !== "string") {
      res.status(401).json({ error: "Autenticação necessária.", code: "UNAUTHORIZED" });
      return;
    }
    req.auth = { id: user, nome: "Teste", email: "t@example.com", role: "po" };
    next();
  }));
  app.use(errorHandler);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/chat`;
});

after(() => {
  server.close();
});

const call = (path: string, user: string | null, init: RequestInit & { json?: unknown } = {}) =>
  fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": user } : {}) },
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
  });

test("exige autenticação em todas as rotas", async () => {
  assert.equal((await call("/conversations", null)).status, 401);
  assert.equal((await call("/query", null, { method: "POST", json: { pergunta: "oi" } })).status, 401);
});

test("consulta cria conversa, devolve origem e lista somente as conversas do usuário", async () => {
  const response = await call("/query", ANA, { method: "POST", json: { pergunta: "Como funciona o login?", projeto_id: PROJECT_A } });
  assert.equal(response.status, 200);
  const body = await response.json() as { conversa_id: string; origem: string; fontes: unknown[] };
  assert.equal(body.origem, "assistente");
  assert.equal(body.fontes.length, 1);

  const mine = await (await call("/conversations", ANA)).json() as { items: Array<{ id: string }> };
  assert.deepEqual(mine.items.map((item) => item.id), [body.conversa_id]);
  const theirs = await (await call("/conversations", BRUNO)).json() as { items: unknown[] };
  assert.equal(theirs.items.length, 0);
});

test("mensagens de outra pessoa retornam 404 e injeção em conversa alheia é recusada", async () => {
  const created = await (await call("/conversations", ANA, { method: "POST", json: { titulo: "Privada", projeto_id: PROJECT_A } })).json() as { id: string };
  assert.equal((await call(`/conversations/${created.id}/messages`, BRUNO)).status, 404);
  assert.equal((await call("/query", BRUNO, { method: "POST", json: { pergunta: "oi oi", conversa_id: created.id } })).status, 404);
  assert.equal((await call(`/conversations/${created.id}/messages`, ANA)).status, 200);
  assert.equal((await call("/conversations/abc/messages", ANA)).status, 400);
});

test("valida o corpo da consulta", async () => {
  assert.equal((await call("/query", ANA, { method: "POST", json: {} })).status, 400);
  assert.equal((await call("/query", ANA, { method: "POST", json: { pergunta: "x".repeat(2001) } })).status, 400);
  assert.equal((await call("/query", ANA, { method: "POST", json: { pergunta: "oi", projeto_id: "nao-uuid" } })).status, 400);
  assert.equal((await call("/query", ANA, { method: "POST", json: { pergunta: "oi", projeto_id: "a0000000-0000-4000-8000-0000000000ff" } })).status, 404);
});
