import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { AppError } from "../../shared/errors.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import type { ChatProgressStage } from "./chat.types.js";
import { createChatRouter, formatThinkingDuration } from "./chat.routes.js";
import type { ChatService } from "./chat.service.js";

const USER = "10000000-0000-4000-8000-000000000001";
const PROJECT = "30000000-0000-4000-8000-000000000001";
const MESSAGE = "40000000-0000-4000-8000-000000000001";
let server: Server;
let baseUrl: string;
let unauthServer: Server;
let unauthBaseUrl: string;
let fail = false;
let unexpectedError = false;
let cancelNext = false;
let cancellationObserved = false;
let renameCall: { user: string; id: string; title: unknown } | null = null;
let lastQueryDelayMs = 0;
let lastAttemptId: string | undefined;

function createService(): ChatService {
  return {
    accessibleProjectsWithKnowledgeReadiness: async () => [{ id: PROJECT, nome: "QA", documentos_total: 0, documentos_processados: 0, documentos_pendentes: 0, documentos_com_falha: 0, trechos_elegiveis: 0, trechos_com_embedding: 0, ultimo_trecho_em: null, prontidao: "empty" }],
    renameConversation: async (user: string, id: string, title: unknown) => {
      renameCall = { user, id, title };
      return { id, usuario_id: user, projeto_id: PROJECT, titulo: String(title), created_at: "2026-10-27T00:00:00Z", updated_at: "2026-10-27T00:00:00Z" };
    },
    query: async (_user: string, input: { attemptId?: string }, onProgress?: (stage: ChatProgressStage) => void, signal?: AbortSignal, onConversationCreated?: (conversation: Record<string, unknown>) => void, onMessagePersisted?: (id: string) => void) => {
      lastAttemptId = input.attemptId;
      if (cancelNext) {
        cancelNext = false;
        return await new Promise((_resolve, reject) => signal?.addEventListener("abort", () => {
          cancellationObserved = true;
          reject(new DOMException("Consulta interrompida.", "AbortError"));
        }, { once: true }));
      }
      if (lastQueryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, lastQueryDelayMs));
      }
      onConversationCreated?.({ id: "20000000-0000-4000-8000-000000000001", titulo: "Pergunta de QA", projeto_id: PROJECT, projeto_nome: "QA", escopo_tipo: "projeto", updated_at: "2026-10-27T00:00:00Z" });
      onMessagePersisted?.(MESSAGE);
      onProgress?.("searching");
      onProgress?.("synthesizing");
      onProgress?.("validating");
      if (fail) throw new AppError("Falha segura", 503, "CHAT_FAILED", { diagnostico_id: "d4ef37fb-7a50-471d-8d10-50692dce8a2f" });
      if (unexpectedError) throw new Error("Erro inesperado com PROMPT_CONFIDENCIAL");
      return { conversa_id: "20000000-0000-4000-8000-000000000001", resposta: "Resposta validada", fontes: [], origem: "assistente" };
    },
  } as unknown as ChatService;
}

before(() => {
  const authentication: express.RequestHandler = (req, _res, next) => {
    req.auth = { id: USER, nome: "QA", email: "qa@example.test", role: "admin" };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use("/api/v1/chat", createChatRouter(createService(), authentication));
  app.use(errorHandler);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;

  const rejectAuth: express.RequestHandler = (_req, res) => {
    res.status(401).json({ error: "Autenticação necessária.", code: "UNAUTHORIZED" });
  };
  const unauthApp = express();
  unauthApp.use(express.json());
  unauthApp.use("/api/v1/chat", createChatRouter(createService(), rejectAuth));
  unauthApp.use(errorHandler);
  unauthServer = unauthApp.listen(0);
  unauthBaseUrl = `http://127.0.0.1:${(unauthServer.address() as AddressInfo).port}/api/v1`;
});

after(() => {
  server.close();
  unauthServer.close();
});

test("formatThinkingDuration cobre segundos e minutos", () => {
  assert.deepEqual(formatThinkingDuration(0), { duration_ms: 0, message: "Pensou por 0s" });
  assert.deepEqual(formatThinkingDuration(15_400), { duration_ms: 15400, message: "Pensou por 15s" });
  assert.deepEqual(formatThinkingDuration(75_000), { duration_ms: 75000, message: "Pensou por 1min15s" });
  assert.deepEqual(formatThinkingDuration(125_999), { duration_ms: 125999, message: "Pensou por 2min5s" });
});

test("GET projetos retorna prontidão do acervo para orientar o escopo do chat", async () => {
  const response = await fetch(`${baseUrl}/chat/projects`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [{
    id: PROJECT, nome: "QA", documentos_total: 0,
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
  lastQueryDelayMs = 0;
  const response = await fetch(`${baseUrl}/chat/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta: "Pergunta de QA", projeto_id: PROJECT, tentativa_id: "50000000-0000-4000-8000-000000000001" }),
  });
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const body = await response.text();
  assert.deepEqual([...body.matchAll(/event: progress\ndata: (.*?)\n\n/g)].map((match) => JSON.parse(match[1]).stage), ["searching", "synthesizing", "validating"]);
  assert.match(body, /event: completed\ndata: .*"resposta":"Resposta validada"/);
  assert.match(body, /event: timing\ndata: .*"duration_ms":\d+/);
  assert.match(body, /event: timing\ndata: .*"message":"Pensou por/);
  const eventOrder = ["conversation", "message_persisted", "progress", "completed", "timing"].map(event => body.indexOf(`event: ${event}\n`));
  assert.ok(eventOrder.every((position, index) => position >= 0 && (index === 0 || position > eventOrder[index - 1])), `SSE event order: ${eventOrder.join(",")}`);
  assert.match(body, /event: message_persisted\ndata: \{"id":"40000000-0000-4000-8000-000000000001"\}/);
  assert.equal(lastAttemptId, "50000000-0000-4000-8000-000000000001");
  assert.doesNotMatch(body, /token|partial|delta/i);
});

test("SSE transmite somente trechos verificados sem IDs e mantém fontes no completed", async () => {
  const quote = "O login exige autenticação.";
  const service = createService() as unknown as { query: (...args: any[]) => Promise<unknown> };
  service.query = async (_user: string, _input: unknown, _progress: unknown, _signal: unknown, _conversation: unknown, onMessagePersisted: (id:string) => void, onEvidenceCandidate: (item: {source_id:string;quote:string}) => void) => {
    onMessagePersisted("40000000-0000-4000-8000-000000000001");
    onEvidenceCandidate({ source_id: "30000000-0000-4000-8000-000000000009", quote });
    return { resposta: quote, fontes: [{ id: "source-id" }], conversa_id: "20000000-0000-4000-8000-000000000001", origem: "assistente" };
  };
  const streamed = createChatRouter(service as unknown as ChatService, (req, _res, next) => { req.auth = { id: USER, nome: "QA", email: "qa@example.test", role: "admin" }; next(); });
  const app = express(); app.use(express.json()); app.use("/api/v1/chat", streamed);
  const local = app.listen(0); const url = `http://127.0.0.1:${(local.address() as AddressInfo).port}/api/v1/chat/query/stream`;
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pergunta: "Como funciona o login?", projeto_id: PROJECT }) });
    const body = await response.text();
    const chunk = /event: evidence_chunk\ndata: (.*?)\n\n/.exec(body);
    assert.ok(chunk);
    assert.deepEqual(JSON.parse(chunk[1]), { sequence: 1, text: quote });
    assert.doesNotMatch(chunk[1], /source|fontes|30000000/);
    assert.ok(body.indexOf("event: message_persisted") < body.indexOf("event: evidence_chunk"));
    assert.ok(body.indexOf("event: evidence_chunk") < body.indexOf("event: completed"));
    assert.match(body, /event: completed\ndata: .*"fontes"/);
  } finally { local.close(); }
});

test("SSE timing reflete a duração real da consulta", async () => {
  fail = false;
  lastQueryDelayMs = 80;
  const response = await fetch(`${baseUrl}/chat/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta: "Pergunta com latência", projeto_id: PROJECT }),
  });
  const body = await response.text();
  lastQueryDelayMs = 0;
  const timingMatch = /event: timing\ndata: (.*?)\n\n/.exec(body);
  assert.ok(timingMatch);
  const timing = JSON.parse(timingMatch[1]) as { duration_ms: number; message: string };
  assert.ok(timing.duration_ms >= 80, `duration_ms=${timing.duration_ms}`);
  assert.match(timing.message, /^Pensou por \d+s$/);
});

test("SSE serializa falhas com envelope seguro e diagnóstico, sem stack ou erro bruto", async () => {
  fail = true;
  const response = await fetch(`${baseUrl}/chat/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta: "Pergunta de QA", projeto_id: PROJECT }),
  });
  const body = await response.text();
  assert.match(body, /event: error/);
  assert.match(body, /"status":503/);
  assert.match(body, /"diagnostic_id":"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/);
  assert.match(body, /"details":\{[^}]*"diagnostico_id":"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/);
  assert.doesNotMatch(body, /stack|private prompt|password/i);
  assert.doesNotMatch(body, /event: timing/);
  fail = false;
});

test("SSE interrompe o processamento quando o cliente fecha a conexão", async () => {
  cancellationObserved = false;
  cancelNext = true;
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/chat/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta: "Pergunta interrompida", projeto_id: PROJECT }),
    signal: controller.signal,
  });
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  controller.abort();
  await response.body?.cancel().catch(() => undefined);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(cancellationObserved, true);
});

test("SSE inclui diagnostic_id em erros inesperados (não-AppError)", async () => {
  unexpectedError = true;
  const originalConsoleError = console.error;
  const loggedArguments: unknown[][] = [];
  console.error = (...args: unknown[]) => { loggedArguments.push(args); };
  let response: Response | undefined;
  try {
    response = await fetch(`${baseUrl}/chat/query/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta: "Pergunta de QA", projeto_id: PROJECT }),
    });
  } finally {
    console.error = originalConsoleError;
  }
  assert.ok(response);
  const body = await response.text();
  assert.match(body, /event: error/);
  assert.match(body, /"status":500/);
  assert.match(body, /"code":"INTERNAL_SERVER_ERROR"/);
  assert.match(body, /"diagnostic_id":"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/);
  assert.match(body, /"details":\{[^}]*"diagnostico_id":"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/);
  assert.doesNotMatch(body, /event: timing/);
  assert.equal(loggedArguments.length, 1);
  const diagnosticMatch = /"diagnostic_id":"([^"]+)"/.exec(body);
  assert.ok(diagnosticMatch);
  assert.deepEqual(loggedArguments[0], ["[Chat Query Error]", {
    diagnostic_id: diagnosticMatch[1],
    code: "INTERNAL_SERVER_ERROR",
  }]);
  assert.doesNotMatch(JSON.stringify(loggedArguments), /PROMPT_CONFIDENCIAL|Erro inesperado|stack/i);
  unexpectedError = false;
});

test("SSE rejeita pergunta vazia com HTTP 400 antes dos cabeçalhos de stream", async () => {
  const response = await fetch(`${baseUrl}/chat/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta: "   ", projeto_id: PROJECT }),
  });
  assert.equal(response.status, 400);
  assert.doesNotMatch(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const payload = await response.json() as { error: string; code: string };
  assert.equal(payload.code, "VALIDATION_ERROR");
  assert.match(payload.error, /Digite uma pergunta/i);
});

test("SSE rejeita escopo inválido com HTTP 400 antes dos cabeçalhos de stream", async () => {
  const response = await fetch(`${baseUrl}/chat/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta: "Pergunta de QA", escopo: "escopo_fantasma" }),
  });
  assert.equal(response.status, 400);
  assert.doesNotMatch(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const payload = await response.json() as { error: string; code: string };
  assert.equal(payload.code, "VALIDATION_ERROR");
  assert.match(payload.error, /Escopo da conversa inválido/i);
});

test("SSE rejeita identificador de projeto inválido com HTTP 400", async () => {
  const response = await fetch(`${baseUrl}/chat/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta: "Pergunta de QA", projeto_id: "projeto-invalido" }),
  });
  assert.equal(response.status, 400);
  assert.doesNotMatch(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const payload = await response.json() as { error: string; code: string };
  assert.equal(payload.code, "VALIDATION_ERROR");
  assert.match(payload.error, /ID do projeto inválido/i);
});

test("SSE rejeita conversa_id inválido com HTTP 400", async () => {
  const response = await fetch(`${baseUrl}/chat/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta: "Pergunta de QA", conversa_id: "nao-e-uuid" }),
  });
  assert.equal(response.status, 400);
  assert.doesNotMatch(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const payload = await response.json() as { error: string; code: string };
  assert.equal(payload.code, "VALIDATION_ERROR");
  assert.match(payload.error, /ID da conversa inválido/i);
});

test("SSE sem autenticação responde 401 sem abrir event-stream", async () => {
  const response = await fetch(`${unauthBaseUrl}/chat/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta: "Pergunta de QA", projeto_id: PROJECT }),
  });
  assert.equal(response.status, 401);
  assert.doesNotMatch(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const payload = await response.json() as { code: string };
  assert.equal(payload.code, "UNAUTHORIZED");
});

test("SSE rejeita tentativa_id inválido com HTTP 400 antes dos cabeçalhos de stream", async () => {
  const response = await fetch(`${baseUrl}/chat/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pergunta: "Pergunta de QA", tentativa_id: "tentativa-invalida" }),
  });
  assert.equal(response.status, 400);
  assert.doesNotMatch(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const payload = await response.json() as { code: string; error: string };
  assert.equal(payload.code, "VALIDATION_ERROR");
  assert.match(payload.error, /ID da tentativa inválido/i);
});
