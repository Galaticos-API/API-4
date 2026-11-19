import test from "node:test";
import assert from "node:assert/strict";
import express, { type RequestHandler } from "express";
import { errorHandler } from "../../middleware/errorHandler.js";
import type { UserRole } from "../auth/auth.types.js";
import { DevelopersController } from "./developers.controller.js";
import { createDevelopersRouter } from "./developers.routes.js";
import { CompetenciesController, CompetenciesService } from "./competencies.service.js";
import { TechnologyNotInVocabularyError } from "./competencies.repository.js";
import type { Competency } from "./developers.types.js";

const DEV_ID = "30000000-0000-4000-8000-000000000001";
const TECH_ID = "20000000-0000-4000-8000-000000000001";
const COMP_ID = "50000000-0000-4000-8000-000000000001";
const ACTOR = "10000000-0000-4000-8000-000000000001";

function fakeRepository() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const competency = (overrides: Partial<Competency> = {}): Competency => ({
    id: COMP_ID,
    desenvolvedor_id: DEV_ID,
    tecnologia_id: TECH_ID,
    nivel: "avancado",
    evidencia: "Entregou a integração PIX do projeto Atlas.",
    tecnologia_nome: "TypeScript",
    tecnologia_categoria: "backend",
    ...overrides,
  });
  return {
    calls,
    async create(developerId: string, input: { tecnologia_id: string; nivel: string; evidencia: string }, actor: string) {
      calls.push({ op: "create", args: [developerId, input, actor] });
      if (input.tecnologia_id !== TECH_ID) throw new TechnologyNotInVocabularyError();
      return competency({ nivel: input.nivel, evidencia: input.evidencia });
    },
    async update(developerId: string, competencyId: string, input: { nivel?: string }, actor: string) {
      calls.push({ op: "update", args: [developerId, competencyId, input, actor] });
      return competency(input as Partial<Competency>);
    },
    async remove(developerId: string, competencyId: string, actor: string) {
      calls.push({ op: "remove", args: [developerId, competencyId, actor] });
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
    createDevelopersRouter(new DevelopersController(), auth, new CompetenciesController(new CompetenciesService(repository))),
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

test("registra competência com nível normalizado e evidência", async () => {
  const { app, repository } = buildApp("po");
  const response = await call(app, "POST", `/developers/${DEV_ID}/competencies`, {
    tecnologia_id: TECH_ID,
    nivel: "Avançado",
    evidencia: "  Entregou a integração PIX do projeto Atlas.  ",
  });
  assert.equal(response.status, 201);
  assert.deepEqual(repository.calls[0]?.args, [
    DEV_ID,
    { tecnologia_id: TECH_ID, nivel: "avancado", evidencia: "Entregou a integração PIX do projeto Atlas." },
    ACTOR,
  ]);
});

test("nível e evidência são obrigatórios e validados", async () => {
  const { app, repository } = buildApp("admin");
  const noEvidence = await call(app, "POST", `/developers/${DEV_ID}/competencies`, { tecnologia_id: TECH_ID, nivel: "avancado" });
  assert.equal(noEvidence.status, 400);
  assert.match(noEvidence.body.error, /evidência/);

  const badLevel = await call(app, "POST", `/developers/${DEV_ID}/competencies`, {
    tecnologia_id: TECH_ID, nivel: "guru", evidencia: "Evidência suficiente aqui.",
  });
  assert.equal(badLevel.status, 400);
  assert.match(badLevel.body.error, /Nível inválido/);

  const personal = await call(app, "POST", `/developers/${DEV_ID}/competencies`, {
    tecnologia_id: TECH_ID, nivel: "avancado", evidencia: "Contato pelo telefone (11) 98765-4321",
  });
  assert.equal(personal.status, 400);
  assert.equal(personal.body.details.purpose_limitation, "LGPD_RNF_09");
  assert.equal(repository.calls.length, 0);
});

test("texto livre no lugar da tecnologia oferece a inclusão no vocabulário", async () => {
  const { app, repository } = buildApp("po");
  const freeText = await call(app, "POST", `/developers/${DEV_ID}/competencies`, {
    tecnologia_id: "Kotlin", nivel: "avancado", evidencia: "Evidência suficiente aqui.",
  });
  assert.equal(freeText.status, 400);
  assert.equal(freeText.body.details.oferecer_inclusao, true);
  assert.equal(repository.calls.length, 0);

  const missing = await call(app, "POST", `/developers/${DEV_ID}/competencies`, {
    tecnologia_id: "20000000-0000-4000-8000-000000000099", nivel: "avancado", evidencia: "Evidência suficiente aqui.",
  });
  assert.equal(missing.status, 422);
  assert.equal(missing.body.code, "TECHNOLOGY_NOT_IN_VOCABULARY");
  assert.equal(missing.body.details.oferecer_inclusao, true);
});

test("edição não troca a tecnologia e remoção responde 204", async () => {
  const { app, repository } = buildApp("admin");
  const swap = await call(app, "PATCH", `/developers/${DEV_ID}/competencies/${COMP_ID}`, { tecnologia_id: TECH_ID });
  assert.equal(swap.status, 400);
  const empty = await call(app, "PATCH", `/developers/${DEV_ID}/competencies/${COMP_ID}`, {});
  assert.equal(empty.status, 400);

  const updated = await call(app, "PATCH", `/developers/${DEV_ID}/competencies/${COMP_ID}`, { nivel: "especialista" });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.nivel, "especialista");

  const removed = await call(app, "DELETE", `/developers/${DEV_ID}/competencies/${COMP_ID}`);
  assert.equal(removed.status, 204);
  assert.deepEqual(repository.calls.map((item) => item.op), ["update", "remove"]);
});

test("dev não registra competências", async () => {
  const { app, repository } = buildApp("dev");
  const response = await call(app, "POST", `/developers/${DEV_ID}/competencies`, {
    tecnologia_id: TECH_ID, nivel: "avancado", evidencia: "Evidência suficiente aqui.",
  });
  assert.equal(response.status, 403);
  assert.equal((await call(app, "DELETE", `/developers/${DEV_ID}/competencies/${COMP_ID}`)).status, 403);
  assert.equal(repository.calls.length, 0);
});
