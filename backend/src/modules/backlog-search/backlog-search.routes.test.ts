import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { errorHandler } from "../../middleware/errorHandler.js";
import { BacklogSearchRepository } from "./backlog-search.repository.js";
import { createBacklogSearchRouter } from "./backlog-search.routes.js";
import { BacklogSearchService } from "./backlog-search.service.js";

const PROJECT = "a0000000-0000-4000-8000-000000000001";

class FakeRepository extends BacklogSearchRepository {
  public last: { projetoId: string; patterns: string[] } | null = null;
  constructor() { super(); }
  async search(projetoId: string, patterns: string[]) {
    this.last = { projetoId, patterns };
    return [];
  }
}

const repository = new FakeRepository();
let server: Server;
let baseUrl: string;

before(() => {
  const app = express();
  const service = new BacklogSearchService(repository, { async findById(id: string) { return id === PROJECT ? { id, status: "ativo" } : null; } });
  app.use("/api/v1/projects/:projectId/backlog-search", createBacklogSearchRouter(service, (req, res, next) => {
    if (req.headers["x-test-user"] !== "ana") {
      res.status(401).json({ error: "Autenticação necessária.", code: "UNAUTHORIZED" });
      return;
    }
    next();
  }));
  app.use(errorHandler);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/projects`;
});

after(() => {
  server.close();
});

const get = (path: string, auth = true) => fetch(`${baseUrl}${path}`, { headers: auth ? { "x-test-user": "ana" } : {} });

test("exige autenticação", async () => {
  assert.equal((await get(`/${PROJECT}/backlog-search?q=login`, false)).status, 401);
});

test("busca no projeto da rota e devolve o contrato", async () => {
  const response = await get(`/${PROJECT}/backlog-search?q=Autentica%C3%A7%C3%A3o`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { projeto_id: PROJECT, termo: "Autenticação", total: 0, limite: 50, items: [] });
  assert.deepEqual(repository.last, { projetoId: PROJECT, patterns: ["%autenticacao%"] });
});

test("valida consulta, filtros e projeto", async () => {
  assert.equal((await get(`/${PROJECT}/backlog-search`)).status, 400);
  assert.equal((await get(`/${PROJECT}/backlog-search?q=a`)).status, 400);
  assert.equal((await get(`/${PROJECT}/backlog-search?q=ab&status=xx`)).status, 400);
  assert.equal((await get(`/${PROJECT}/backlog-search?q=ab&tecnologia=xx`)).status, 400);
  assert.equal((await get(`/nao-uuid/backlog-search?q=ab`)).status, 400);
  assert.equal((await get(`/a0000000-0000-4000-8000-0000000000ff/backlog-search?q=ab`)).status, 404);
});
