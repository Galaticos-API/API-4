import test from "node:test";
import assert from "node:assert/strict";
import express, { type RequestHandler } from "express";
import { AddressInfo } from "node:net";
import { errorHandler } from "../../middleware/errorHandler.js";
import { createSearchRouter } from "./search.routes.js";
import type { SearchService } from "./search.service.js";
import type { HybridSearchInput } from "./search.types.js";

const PROJECT = "60000000-0000-4000-8000-000000000001";
const TECH = "60000000-0000-4000-8000-000000000099";

async function withServer(handler: RequestHandler, service: SearchService, run: (url: string) => Promise<void>) {
  const app = express();
  app.use("/api/v1/search", createSearchRouter(service, handler));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}/api/v1/search`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("exige texto e projeto válido e rejeita filtros inválidos", async () => {
  const calls: HybridSearchInput[] = [];
  const service = { async search(input: HybridSearchInput) { calls.push(input); return { items: [], total: 0 }; } } as unknown as SearchService;
  await withServer((_req, _res, next) => next(), service, async (url) => {
    assert.equal((await fetch(url)).status, 400);
    assert.equal((await fetch(`${url}?q=ab&projeto_id=${PROJECT}`)).status, 400);
    assert.equal((await fetch(`${url}?q=login`)).status, 400);
    assert.equal((await fetch(`${url}?q=login&projeto_id=not-uuid`)).status, 400);
    assert.equal((await fetch(`${url}?q=login&projeto_id=${PROJECT}&nivel=admin`)).status, 400);
    assert.equal((await fetch(`${url}?q=login&projeto_id=${PROJECT}&limit=1.5`)).status, 400);
    assert.equal((await fetch(`${url}?q=login&projeto_id=${PROJECT}&limit=1e1`)).status, 400);
  });
  assert.deepEqual(calls, []);
});

test("aceita aliases documentados e encaminha filtros combinados ao serviço", async () => {
  const calls: HybridSearchInput[] = [];
  const service = { async search(input: HybridSearchInput) { calls.push(input); return { items: [], total: 0, query: input.query }; } } as unknown as SearchService;
  await withServer((_req, _res, next) => next(), service, async (url) => {
    const response = await fetch(`${url}?q=login%20de%20cliente&projectId=${PROJECT}&technology_id=${TECH}&level=pbi&limit=7`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [], total: 0, query: "login de cliente" });
  });
  assert.deepEqual(calls, [{
    query: "login de cliente", projectId: PROJECT, technologyId: TECH, level: "pbi", limit: 7,
  }]);
});

test("a rota de produção mantém autenticação obrigatória", async () => {
  const service = { async search() { throw new Error("não deve executar sem sessão"); } } as unknown as SearchService;
  const app = express();
  app.use("/api/v1/search", createSearchRouter(service));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/search?q=login&projeto_id=${PROJECT}`);
    assert.equal(response.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
