import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { errorHandler } from "../../middleware/errorHandler.js";
import { requireRole } from "../../middleware/requireRole.js";
import type { UserRole } from "../auth/auth.types.js";
import { createProjectSimilarItemsRouter, createReuseSimilarItemRouter } from "./similar-items.routes.js";
import { SimilarItemsService } from "./similar-items.service.js";
import { FakeEmbeddings, FakeSimilarItemsRepository, ORIGIN_PBI, PROJECT_A, PROJECT_B, TARGET_PBI, UNKNOWN_PBI, USER, similarRow } from "./similar-items.fakes.js";

const repository = new FakeSimilarItemsRepository();
const embeddings = new FakeEmbeddings();
let server: Server;
let baseUrl: string;
let role: UserRole | null = "po";

before(() => {
  repository.candidates = [similarRow()];
  repository.origins.set(ORIGIN_PBI, { projeto_id: PROJECT_B, arquivado: false, dados: { titulo: "Validar login com e-mail" } });
  const service = new SimilarItemsService(repository, embeddings, 0.7);
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
  app.use("/api/v1/projects/:projectId/similar-items", createProjectSimilarItemsRouter(service, authentication));
  app.use("/api/v1/pbis/:entityId/similar-items", createReuseSimilarItemRouter("pbi", service, authentication, requireRole("admin", "po")));
  app.use(errorHandler);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

after(() => {
  server.close();
});

const call = (path: string, json?: unknown) =>
  fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: json === undefined ? undefined : JSON.stringify(json) });

const draft = { tipo: "pbi", titulo: "Validar login do usuário", descricao: "Entrar com e-mail e senha" };

test("exige autenticação na busca e no aproveitamento", async () => {
  role = null;
  assert.equal((await call(`/projects/${PROJECT_A}/similar-items`, draft)).status, 401);
  assert.equal((await call(`/pbis/${TARGET_PBI}/similar-items/${ORIGIN_PBI}/reuse`, {})).status, 401);
  role = "po";
});

test("busca devolve os itens com projeto de origem e todos os perfis podem consultar", async () => {
  for (const current of ["po", "dev"] as const) {
    role = current;
    const response = await call(`/projects/${PROJECT_A}/similar-items`, draft);
    assert.equal(response.status, 200);
    const body = await response.json() as { items: Array<{ outro_projeto: boolean; projeto: { nome: string } }>; degradado: boolean };
    assert.equal(body.items[0].outro_projeto, true);
    assert.equal(body.items[0].projeto.nome, "Portal do Cliente");
    assert.equal(body.degradado, false);
  }
  role = "po";
});

test("busca valida o corpo e o projeto", async () => {
  assert.equal((await call(`/projects/${PROJECT_A}/similar-items`, { tipo: "projeto" })).status, 400);
  assert.equal((await call(`/projects/nao-uuid/similar-items`, draft)).status, 400);
  assert.equal((await call(`/projects/a1000000-0000-4000-8000-0000000000ff/similar-items`, draft)).status, 404);
});

test("indisponibilidade da IA não vira erro: 200 com degradado", async () => {
  const { AppError } = await import("../../shared/errors.js");
  embeddings.failure = new AppError("fora", 503, "EMBEDDING_SERVICE_UNAVAILABLE");
  const response = await call(`/projects/${PROJECT_A}/similar-items`, draft);
  embeddings.failure = null;
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], total: 0, degradado: true });
});

test("aproveitar: po recebe 201 com proposta pendente e relação; dev recebe 403", async () => {
  const created = await call(`/pbis/${TARGET_PBI}/similar-items/${ORIGIN_PBI}/reuse`, {});
  assert.equal(created.status, 201);
  const body = await created.json() as { relacao: { tipo_relacao: string }; sugestoes: Array<{ status: string; origem: string }> };
  assert.equal(body.relacao.tipo_relacao, "reaproveitado_de");
  assert.equal(body.sugestoes[0].status, "pendente");
  assert.equal(body.sugestoes[0].origem, `similar:pbi:${ORIGIN_PBI}`);

  role = "dev";
  assert.equal((await call(`/pbis/${TARGET_PBI}/similar-items/${ORIGIN_PBI}/reuse`, {})).status, 403);
  role = "po";
});

test("aproveitar valida identificadores e corpo; origem inexistente retorna 404; arquivado 409", async () => {
  assert.equal((await call(`/pbis/${TARGET_PBI}/similar-items/${TARGET_PBI}/reuse`, {})).status, 400);
  assert.equal((await call(`/pbis/${TARGET_PBI}/similar-items/${ORIGIN_PBI}/reuse`, { campos: ["status"] })).status, 400);
  assert.equal((await call(`/pbis/${TARGET_PBI}/similar-items/${UNKNOWN_PBI}/reuse`, {})).status, 404);
  repository.archivedTargets.add(TARGET_PBI);
  assert.equal((await call(`/pbis/${TARGET_PBI}/similar-items/${ORIGIN_PBI}/reuse`, {})).status, 409);
  repository.archivedTargets.delete(TARGET_PBI);
});
