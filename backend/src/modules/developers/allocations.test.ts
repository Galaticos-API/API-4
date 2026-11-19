import test from "node:test";
import assert from "node:assert/strict";
import express, { type RequestHandler } from "express";
import { errorHandler } from "../../middleware/errorHandler.js";
import type { UserRole } from "../auth/auth.types.js";
import { DevelopersController } from "./developers.controller.js";
import { createDevelopersRouter } from "./developers.routes.js";
import { CompetenciesController } from "./competencies.service.js";
import { AllocationsController, AllocationsService } from "./allocations.service.js";
import type { DeveloperAllocation } from "./developers.types.js";

const DEV_ID = "30000000-0000-4000-8000-000000000001";
const PROJECT_ID = "40000000-0000-4000-8000-000000000001";
const ALLOC_ID = "60000000-0000-4000-8000-000000000001";
const ACTOR = "10000000-0000-4000-8000-000000000001";

function fakeRepository() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const allocation = (overrides: Partial<DeveloperAllocation> = {}): DeveloperAllocation => ({
    id: ALLOC_ID, desenvolvedor_id: DEV_ID, projeto_id: PROJECT_ID, projeto_nome: "Atlas", projeto_status: "ativo",
    papel: "Desenvolvedor backend", data_inicio: "2026-03-01T03:00:00.000Z", data_fim: null, em_andamento: true,
    ...overrides,
  });
  return {
    calls,
    async create(developerId: string, input: unknown, actor: string) {
      calls.push({ op: "create", args: [developerId, input, actor] });
      return allocation();
    },
    async update(developerId: string, allocationId: string, input: unknown, actor: string) {
      calls.push({ op: "update", args: [developerId, allocationId, input, actor] });
      return allocation();
    },
    async remove(developerId: string, allocationId: string, actor: string) {
      calls.push({ op: "remove", args: [developerId, allocationId, actor] });
    },
  };
}

function buildApp(role: UserRole, repository = fakeRepository()) {
  const auth: RequestHandler = (req, _res, next) => {
    req.auth = { id: ACTOR, role } as typeof req.auth;
    next();
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/developers",
    createDevelopersRouter(
      new DevelopersController(),
      auth,
      new CompetenciesController(),
      new AllocationsController(new AllocationsService(repository)),
    ),
  );
  app.use(errorHandler);
  return { app, repository };
}

async function call(app: express.Express, method: string, path: string, body?: unknown) {
  const server = app.listen(0);
  try {
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: response.status, body: (text ? JSON.parse(text) : null) as any };
  } finally {
    server.close();
  }
}

const base = `/developers/${DEV_ID}/allocations`;

test("registra alocação com projeto, papel e período", async () => {
  const { app, repository } = buildApp("po");
  const response = await call(app, "POST", base, {
    projeto_id: PROJECT_ID, papel: " Desenvolvedor backend ", data_inicio: "2026-03-01", data_fim: "2026-06-30",
  });
  assert.equal(response.status, 201);
  assert.deepEqual(repository.calls[0]?.args[1], {
    projeto_id: PROJECT_ID, papel: "Desenvolvedor backend", data_inicio: "2026-03-01", data_fim: "2026-06-30",
  });
});

test("sem data de término a alocação fica em andamento", async () => {
  const { app, repository } = buildApp("admin");
  const response = await call(app, "POST", base, { projeto_id: PROJECT_ID, papel: "Tech Lead", data_inicio: "2026-03-01" });
  assert.equal(response.status, 201);
  assert.equal((repository.calls[0]?.args[1] as { data_fim: unknown }).data_fim, null);
});

test("término anterior ao início é impedido e indica a inconsistência", async () => {
  const { app, repository } = buildApp("po");
  const response = await call(app, "POST", base, {
    projeto_id: PROJECT_ID, papel: "Tech Lead", data_inicio: "2026-06-01", data_fim: "2026-05-31",
  });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /término não pode ser anterior/);
  assert.equal(response.body.details.field, "data_fim");
  assert.equal(repository.calls.length, 0);
});

test("datas, papel e projeto inválidos são rejeitados", async () => {
  const { app, repository } = buildApp("po");
  const cases = [
    { projeto_id: PROJECT_ID, papel: "Tech Lead", data_inicio: "2026-02-30" },
    { projeto_id: PROJECT_ID, papel: "Tech Lead", data_inicio: "01/03/2026" },
    { projeto_id: PROJECT_ID, papel: "", data_inicio: "2026-03-01" },
    { projeto_id: "Atlas", papel: "Tech Lead", data_inicio: "2026-03-01" },
    { projeto_id: PROJECT_ID, papel: "Tech Lead", data_inicio: "2026-03-01", salario: 1 },
  ];
  for (const body of cases) {
    assert.equal((await call(app, "POST", base, body)).status, 400, JSON.stringify(body));
  }
  assert.equal(repository.calls.length, 0);
});

test("edição não troca o projeto, encerra alocação e remoção responde 204", async () => {
  const { app, repository } = buildApp("admin");
  assert.equal((await call(app, "PATCH", `${base}/${ALLOC_ID}`, { projeto_id: PROJECT_ID })).status, 400);
  assert.equal((await call(app, "PATCH", `${base}/${ALLOC_ID}`, {})).status, 400);
  assert.equal((await call(app, "PATCH", `${base}/${ALLOC_ID}`, { data_fim: "2026-09-30" })).status, 200);
  assert.deepEqual(repository.calls[0]?.args[2], { data_fim: "2026-09-30" });
  assert.equal((await call(app, "DELETE", `${base}/${ALLOC_ID}`)).status, 204);
});

test("dev não altera alocações (elas concedem acesso a projetos)", async () => {
  const { app, repository } = buildApp("dev");
  assert.equal((await call(app, "POST", base, { projeto_id: PROJECT_ID, papel: "Tech Lead", data_inicio: "2026-03-01" })).status, 403);
  assert.equal((await call(app, "DELETE", `${base}/${ALLOC_ID}`)).status, 403);
  assert.equal(repository.calls.length, 0);
});
