import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { errorHandler } from "../../middleware/errorHandler.js";
import { requireRole } from "../../middleware/requireRole.js";
import type { UserRole } from "../auth/auth.types.js";
import { createSuggestionsRouter } from "./suggestions.routes.js";
import { SuggestionsService } from "./suggestions.service.js";
import { EPIC, FakeSuggestionsRepository, PBI, USER } from "./suggestions.fakes.js";

const repository = new FakeSuggestionsRepository();
let server: Server;
let baseUrl: string;
let role: UserRole | null = "po";

before(() => {
  const service = new SuggestionsService(repository);
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
  app.use("/api/v1/pbis/:entityId/suggestions", createSuggestionsRouter("pbi", service, authentication, requireRole("admin", "po")));
  app.use("/api/v1/epics/:entityId/suggestions", createSuggestionsRouter("epico", service, authentication, requireRole("admin", "po")));
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

test("exige autenticação em todas as sub-rotas", async () => {
  role = null;
  assert.equal((await call(`/pbis/${PBI}/suggestions`)).status, 401);
  assert.equal((await call(`/pbis/${PBI}/suggestions`, { method: "POST", json: { campo: "titulo", valor_sugerido: "x" } })).status, 401);
  assert.equal((await call(`/pbis/${PBI}/suggestions/x/accept`, { method: "POST" })).status, 401);
  role = "po";
});

test("PO propõe (201) e todos os perfis consultam; dev não propõe nem resolve (403)", async () => {
  const created = await call(`/pbis/${PBI}/suggestions`, { method: "POST", json: { campo: "titulo", valor_sugerido: "Validar login" } });
  assert.equal(created.status, 201);
  const body = await created.json() as { id: string; status: string };
  assert.equal(body.status, "pendente");

  role = "dev";
  assert.equal((await call(`/pbis/${PBI}/suggestions`, { method: "POST", json: { campo: "titulo", valor_sugerido: "x" } })).status, 403);
  assert.equal((await call(`/pbis/${PBI}/suggestions/${body.id}/accept`, { method: "POST" })).status, 403);
  const list = await call(`/pbis/${PBI}/suggestions`);
  assert.equal(list.status, 200);
  assert.equal(((await list.json()) as { items: unknown[] }).items.length, 1);
  role = "po";
});

test("valida o corpo da proposta e o identificador do item", async () => {
  assert.equal((await call(`/pbis/${PBI}/suggestions`, { method: "POST", json: { campo: "status", valor_sugerido: "concluido" } })).status, 400);
  assert.equal((await call(`/pbis/${PBI}/suggestions`, { method: "POST", json: {} })).status, 400);
  assert.equal((await call(`/pbis/nao-uuid/suggestions`)).status, 400);
  assert.equal((await call(`/pbis/a0000000-0000-4000-8000-0000000000ff/suggestions`)).status, 404);
});

test("ciclo completo: aceitar aplica o valor e repetir é idempotente (200)", async () => {
  const created = await (await call(`/epics/${EPIC}/suggestions`, { method: "POST", json: { campo: "objetivo", valor_sugerido: "Organizar backlog" } })).json() as { id: string };
  const accept = await call(`/epics/${EPIC}/suggestions/${created.id}/accept`, { method: "POST", json: {} });
  assert.equal(accept.status, 200);
  const acceptedBody = await accept.json() as { status: string; valor_resolvido: string };
  assert.equal(acceptedBody.status, "aceita");
  assert.equal(acceptedBody.valor_resolvido, "Organizar backlog");

  const repeat = await call(`/epics/${EPIC}/suggestions/${created.id}/accept`, { method: "POST", json: {} });
  assert.equal(repeat.status, 200);
  assert.deepEqual(await repeat.json(), acceptedBody);
});

test("editar depois de aceito com valor diferente retorna 409", async () => {
  const created = await (await call(`/epics/${EPIC}/suggestions`, { method: "POST", json: { campo: "descricao", valor_sugerido: "Texto original" } })).json() as { id: string };
  await call(`/epics/${EPIC}/suggestions/${created.id}/accept`, { method: "POST", json: {} });
  const conflict = await call(`/epics/${EPIC}/suggestions/${created.id}/edit`, { method: "POST", json: { valor: "Outro texto" } });
  assert.equal(conflict.status, 409);
});

test("descartar nunca aplica valor e é idempotente", async () => {
  const created = await (await call(`/epics/${EPIC}/suggestions`, { method: "POST", json: { campo: "titulo", valor_sugerido: "Descartar isso" } })).json() as { id: string };
  const discard = await call(`/epics/${EPIC}/suggestions/${created.id}/discard`, { method: "POST" });
  assert.equal(discard.status, 200);
  const body = await discard.json() as { status: string; valor_resolvido: string | null };
  assert.equal(body.status, "descartada");
  assert.equal(body.valor_resolvido, null);
  assert.equal((await call(`/epics/${EPIC}/suggestions/${created.id}/discard`, { method: "POST" })).status, 200);
});

test("item ou ancestral arquivado recusa aceitar/editar com 409", async () => {
  const created = await (await call(`/pbis/${PBI}/suggestions`, { method: "POST", json: { campo: "historia_como_um", valor_sugerido: "usuário cadastrado" } })).json() as { id: string };
  repository.archived.add(PBI);
  assert.equal((await call(`/pbis/${PBI}/suggestions/${created.id}/accept`, { method: "POST", json: {} })).status, 409);
  repository.archived.delete(PBI);
});

test("sugestão inexistente ou de outro item retorna 404", async () => {
  assert.equal((await call(`/pbis/${PBI}/suggestions/a0000000-0000-4000-8000-0000000000ff/accept`, { method: "POST", json: {} })).status, 404);
  const created = await (await call(`/pbis/${PBI}/suggestions`, { method: "POST", json: { campo: "titulo", valor_sugerido: "x" } })).json() as { id: string };
  assert.equal((await call(`/epics/${EPIC}/suggestions/${created.id}/accept`, { method: "POST", json: {} })).status, 404);
});
