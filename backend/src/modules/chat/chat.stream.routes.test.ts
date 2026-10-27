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

before(() => {
  const service = {
    query: async (_user: string, _input: unknown, onProgress?: (stage: ChatProgressStage) => void) => {
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
