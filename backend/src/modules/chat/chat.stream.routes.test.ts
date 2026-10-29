import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { AppError } from "../../shared/errors.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import type { ChatProgressStage } from "./chat.types.js";
import { createChatRouter } from "./chat.routes.js";
import type { ChatService } from "./chat.service.js";

const USER = "10000000-0000-4000-8000-000000000001";
let server: Server;
let baseUrl: string;
let fail = false;
let cancelNext = false;
let cancellationObserved = false;
let renameCall: { user: string; id: string; title: unknown } | null = null;

before(() => {
  const service = {
    accessibleProjectsWithKnowledgeReadiness: async () => [{ id: "30000000-0000-4000-8000-000000000001", nome: "QA", documentos_total: 0, documentos_processados: 0, documentos_pendentes: 0, documentos_com_falha: 0, trechos_elegiveis: 0, trechos_com_embedding: 0, ultimo_trecho_em: null, prontidao: "empty" }],
    renameConversation: async (user: string, id: string, title: unknown) => {
      renameCall = { user, id, title };
      return { id, usuario_id: user, projeto_id: "30000000-0000-4000-8000-000000000001", titulo: String(title), created_at: "2026-10-27T00:00:00Z", updated_at: "2026-10-27T00:00:00Z" };
    },
    query: async (_user: string, _input: unknown, onProgress?: (stage: ChatProgressStage) => void, signal?: AbortSignal) => {
      if (cancelNext) {
        cancelNext = false;
        return await new Promise((_resolve, reject) => signal?.addEventListener("abort", () => {
          cancellationObserved = true;
          reject(new DOMException("Consulta interrompida.", "AbortError"));
        }, { once: true }));
      }
      onProgress?.("searching");
      onProgress?.("synthesizing");
      onProgress?.("validating");
      if (fail) throw new AppError("Falha segura", 503, "CHAT_FAILED", { diagnostico_id: "d4ef37fb-7a50-471d-8d10-50692dce8a2f" });
      return { conversa_id: "20000000-0000-4000-8000-000000000001", resposta: "Resposta validada", fontes: [], origem: "assistente" };
    },
  } as unknown as ChatService;
  const authentication: express.RequestHandler = (req, _res, next) => {
    req.auth = { id: USER, nome: "QA", email: "qa@example.test", role: "admin" };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use("/api/v1/chat", createChatRouter(service, authentication));
  app.use(errorHandler);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

after(() => server.close());

test("GET projetos retorna prontidão do acervo para orientar o escopo do chat", async () => {
  const response = await fetch(`${baseUrl}/chat/projects`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [{
    id: "30000000-0000-4000-8000-000000000001", nome: "QA", documentos_total: 0,
    documentos_processados: 0, documentos_pendentes: 0, documentos_com_falha: 0,
    trechos_elegiveis: 0, trechos_com_embedding: 0, ultimo_trecho_em: null, prontidao: "empty",
  }] });
});

test("PATCH renomeia uma conversa autenticada e devolve o título salvo", async () => {
  const id = "20000000-0000-4000-8000-000000000001";
  const response = await fetch(`${baseUrl}/chat/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titulo: "Decisões arquiteturais" }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as { titulo: string };
  assert.equal(payload.titulo, "Decisões arquiteturais");
  assert.deepEqual(renameCall, { user: USER, id, title: "Decisões arquiteturais" });
});

test("SSE relata etapas reais e envia somente a resposta final concluída", async () => {
  fail = false;
  const response = await fetch(`${baseUrl}/chat/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta: "Pergunta de QA", projeto_id: "30000000-0000-4000-8000-000000000001" }),
  });
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const body = await response.text();
  assert.deepEqual([...body.matchAll(/event: progress\ndata: (.*?)\n\n/g)].map((match) => JSON.parse(match[1]).stage), ["searching", "synthesizing", "validating"]);
  assert.match(body, /event: completed\ndata: .*"resposta":"Resposta validada"/);
  assert.doesNotMatch(body, /token|partial|delta/i);
});

test("SSE serializa falhas com envelope seguro e diagnóstico, sem stack ou erro bruto", async () => {
  fail = true;
  const response = await fetch(`${baseUrl}/chat/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta: "Pergunta de QA", projeto_id: "30000000-0000-4000-8000-000000000001" }),
  });
  const body = await response.text();
  assert.match(body, /event: error/);
  assert.match(body, /"status":503/);
  assert.match(body, /d4ef37fb-7a50-471d-8d10-50692dce8a2f/);
  assert.doesNotMatch(body, /stack|private prompt|password/i);
  fail = false;
});

test("SSE interrompe o processamento quando o cliente fecha a conexão", async () => {
  cancellationObserved = false;
  cancelNext = true;
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/chat/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta: "Pergunta interrompida", projeto_id: "30000000-0000-4000-8000-000000000001" }),
    signal: controller.signal,
  });
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  controller.abort();
  await response.body?.cancel().catch(() => undefined);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(cancellationObserved, true);
});
