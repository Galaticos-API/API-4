import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { createChunksRouter } from "./chunks.routes.js";
import { ChunksService, type PersistChunksInput, type PersistChunksResult } from "./chunks.service.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { env } from "../../config/env.js";

const PROJECT_ID = "a0000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "b0000000-0000-4000-8000-000000000001";

class StubChunksService extends ChunksService {
  public calls: PersistChunksInput[] = [];
  async persist(input: PersistChunksInput): Promise<PersistChunksResult> {
    this.calls.push(input);
    return {
      documento_id: input.documentoId,
      projeto_id: input.projetoId,
      total_chunks: input.chunks.length,
      status_processamento: "processado",
    };
  }
}

const service = new StubChunksService();
let server: Server;
let baseUrl: string;

before(() => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/projects/:projectId/documents/:documentId/chunks", createChunksRouter(service));
  app.use(errorHandler);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/projects/${PROJECT_ID}/documents/${DOCUMENT_ID}/chunks`;
});

after(() => {
  server.close();
});

const validEmbedding = () => Array.from({ length: 1024 }, () => 0.1);
const call = (init: { token?: string | null; body?: unknown } = {}) =>
  fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init.token === null ? {} : { Authorization: `Bearer ${init.token ?? env.N8N_INGEST_TOKEN}` }),
    },
    body: init.body === undefined ? JSON.stringify({ chunks: [{ chunk_index: 0, content: "x", embedding: validEmbedding() }] }) : JSON.stringify(init.body),
  });

test("sem Authorization retorna 401 sem chamar o serviço", async () => {
  service.calls = [];
  const res = await call({ token: null });
  assert.equal(res.status, 401);
  assert.equal(service.calls.length, 0);
});

test("token errado retorna 401", async () => {
  service.calls = [];
  assert.equal((await call({ token: "errado" })).status, 401);
  assert.equal(service.calls.length, 0);
});

test("payload válido passa pelo serviço e devolve o resumo", async () => {
  service.calls = [];
  const res = await call();
  assert.equal(res.status, 200);
  const body = await res.json() as { total_chunks: number; status_processamento: string };
  assert.equal(body.total_chunks, 1);
  assert.equal(body.status_processamento, "processado");
  assert.equal(service.calls.length, 1);
  assert.equal(service.calls[0].projetoId, PROJECT_ID);
  assert.equal(service.calls[0].documentoId, DOCUMENT_ID);
});
