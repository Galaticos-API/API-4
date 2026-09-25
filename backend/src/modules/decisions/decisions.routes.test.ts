import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { errorHandler } from "../../middleware/errorHandler.js";
import { requireRole } from "../../middleware/requireRole.js";
import type { UserRole } from "../auth/auth.types.js";
import { createDecisionsRouter } from "./decisions.routes.js";
import { DecisionsService } from "./decisions.service.js";
import { FEATURE, FakeDecisionsRepository, PBI, USER } from "./decisions.fakes.js";

const repository = new FakeDecisionsRepository();
let server: Server;
let baseUrl: string;
let role: UserRole | null = "po";

const valid = { titulo: "Usar PostgreSQL", contexto: "Contexto", decisao: "Decisão", justificativa: "Motivo" };

before(() => {
  const service = new DecisionsService(repository);
  const app = express();
  app.use(express.json());
  const authentication = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!role) {
      res.status(401).json({ error: "Autenticação necessária.", code: "UNAUTHORIZED" });
      return;
    }
    req.auth = { id: USER, nome: "Ana", email: "a@example.com", role };
    next();
  };
  app.use("/api/v1/pbis/:entityId/decisions", createDecisionsRouter("pbi", service, authentication, requireRole("admin", "po")));
  app.use("/api/v1/features/:entityId/decisions", createDecisionsRouter("feature", service, authentication, requireRole("admin", "po")));
  app.use(errorHandler);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

after(() => {
  server.close();
});

const call = (path: string, init: { method?: string; json?: unknown } = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
  });

test("exige autenticação para listar e registrar", async () => {
  role = null;
  assert.equal((await call(`/pbis/${PBI}/decisions`)).status, 401);
  assert.equal((await call(`/pbis/${PBI}/decisions`, { method: "POST", json: valid })).status, 401);
  role = "po";
});

test("PO registra (201) e todos os perfis consultam; dev não registra (403)", async () => {
  const created = await call(`/pbis/${PBI}/decisions`, { method: "POST", json: { ...valid, alternativas: "MySQL" } });
  assert.equal(created.status, 201);
  const body = await created.json() as { id: string; alternativas: string; autor: { nome: string } };
  assert.equal(body.alternativas, "MySQL");
  assert.equal(body.autor.nome, "Ana PO");

  role = "dev";
  assert.equal((await call(`/pbis/${PBI}/decisions`, { method: "POST", json: valid })).status, 403);
  const list = await call(`/pbis/${PBI}/decisions`);
  assert.equal(list.status, 200);
  assert.equal(((await list.json()) as { decisoes: unknown[] }).decisoes.length, 1);
  role = "po";
});

test("valida o corpo e o identificador", async () => {
  assert.equal((await call(`/pbis/${PBI}/decisions`, { method: "POST", json: { titulo: "Somente título" } })).status, 400);
  assert.equal((await call(`/pbis/nao-uuid/decisions`)).status, 400);
  assert.equal((await call(`/pbis/a0000000-0000-4000-8000-0000000000ff/decisions`)).status, 404);
});

test("arquivado retorna 409 sem registrar e a herança aparece na consulta do PBI", async () => {
  await call(`/features/${FEATURE}/decisions`, { method: "POST", json: { ...valid, titulo: "Decisão da feature" } });
  const inherited = await (await call(`/pbis/${PBI}/decisions`)).json() as { decisoes: Array<{ titulo: string; origem: { herdada: boolean } }> };
  assert.ok(inherited.decisoes.some((item) => item.titulo === "Decisão da feature" && item.origem.herdada));

  const before = repository.rows.length;
  repository.archived.add(PBI);
  assert.equal((await call(`/pbis/${PBI}/decisions`, { method: "POST", json: valid })).status, 409);
  assert.equal(repository.rows.length, before);
  repository.archived.delete(PBI);
});
