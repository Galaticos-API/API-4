import test from "node:test";
import assert from "node:assert/strict";
import express, { type RequestHandler } from "express";
import { errorHandler } from "../../middleware/errorHandler.js";
import type { UserRole } from "../auth/auth.types.js";
import { TechnologiesController } from "./technologies.controller.js";
import {
  TechnologiesRepository,
  TechnologyExistsError,
  TechnologyInUseError,
} from "./technologies.repository.js";
import { TechnologiesService } from "./technologies.service.js";
import { normalizeTechnologyName, type Technology } from "./technologies.types.js";
import { requireRole } from "../../middleware/requireRole.js";

const NODE_ID = "20000000-0000-4000-8000-000000000010";
const ACTOR = "10000000-0000-4000-8000-000000000001";

function technology(overrides: Partial<Technology> = {}): Technology {
  return {
    id: NODE_ID,
    nome: "Node.js",
    categoria: "backend",
    uso: { competencias: 2, itens: 1, total: 3 },
    ...overrides,
  };
}

function fakeRepository() {
  const items = new Map<string, Technology>([[NODE_ID, technology()]]);
  const calls: Array<{ op: string; args: unknown[] }> = [];
  let seq = 0;
  return {
    calls,
    items,
    async list(search?: string) {
      calls.push({ op: "list", args: [search] });
      const values = [...items.values()];
      return search
        ? values.filter((item) => normalizeTechnologyName(item.nome).includes(normalizeTechnologyName(search)))
        : values;
    },
    async create(input: { nome: string; categoria: string }, actor: string) {
      calls.push({ op: "create", args: [input, actor] });
      const existing = [...items.values()].find(
        (item) => normalizeTechnologyName(item.nome) === normalizeTechnologyName(input.nome),
      );
      if (existing) throw new TechnologyExistsError(existing);
      const created = technology({
        id: `20000000-0000-4000-8000-0000000001${String(++seq).padStart(2, "0")}`,
        nome: input.nome,
        categoria: input.categoria,
        uso: { competencias: 0, itens: 0, total: 0 },
      });
      items.set(created.id, created);
      return created;
    },
    async update(id: string, input: { nome?: string }, actor: string) {
      calls.push({ op: "update", args: [id, input, actor] });
      const current = items.get(id)!;
      const next = { ...current, ...input };
      items.set(id, next);
      return next;
    },
    async remove(id: string, confirmed: number | undefined, actor: string) {
      calls.push({ op: "remove", args: [id, confirmed, actor] });
      const current = items.get(id)!;
      if (current.uso.total > 0 && confirmed !== current.uso.total) throw new TechnologyInUseError(current);
      items.delete(id);
      return current.uso;
    },
  };
}

function buildApp(role: UserRole, repository = fakeRepository()) {
  const controller = new TechnologiesController(new TechnologiesService(repository));
  const auth: RequestHandler = (req, _res, next) => {
    req.auth = { id: ACTOR, role } as typeof req.auth;
    next();
  };
  const app = express();
  app.use(express.json());
  app.use(auth);
  app.get("/technologies", controller.list);
  app.post("/technologies", requireRole("admin", "po"), controller.create);
  app.patch("/technologies/:id", requireRole("admin"), controller.update);
  app.delete("/technologies/:id", requireRole("admin"), controller.remove);
  app.use(errorHandler);
  return { app, repository };
}

async function request(app: express.Express, method: string, path: string, body?: unknown) {
  const server = app.listen(0);
  try {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: response.status, body: (await response.json()) as any };
  } finally {
    server.close();
  }
}

test("normalização trata variações de escrita como a mesma tecnologia", () => {
  for (const variant of ["Node.js", "NodeJS", "node js", "NODE-JS", "Nóde.js"]) {
    assert.equal(normalizeTechnologyName(variant), "nodejs");
  }
  assert.notEqual(normalizeTechnologyName("C++"), normalizeTechnologyName("C#"));
  assert.notEqual(normalizeTechnologyName("C"), normalizeTechnologyName("C++"));
});

test("cadastrar variação de tecnologia existente aponta o registro existente", async () => {
  const { app } = buildApp("admin");
  const response = await request(app, "POST", "/technologies", { nome: "NodeJS", categoria: "backend" });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "TECHNOLOGY_EXISTS");
  assert.equal(response.body.details.existente.id, NODE_ID);
  assert.equal(response.body.details.existente.nome, "Node.js");
});

test("tecnologia nova exige nome e categoria válidos e fica disponível", async () => {
  const { app, repository } = buildApp("po");
  const invalid = await request(app, "POST", "/technologies", { nome: "Kafka", categoria: "mensageria" });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /Categoria inválida/);

  const onlyPunctuation = await request(app, "POST", "/technologies", { nome: "...", categoria: "backend" });
  assert.equal(onlyPunctuation.status, 400);

  const created = await request(app, "POST", "/technologies", { nome: "  Kafka ", categoria: "backend" });
  assert.equal(created.status, 201);
  assert.equal(created.body.nome, "Kafka");
  assert.deepEqual(repository.calls.at(-1)?.args[1], ACTOR);

  const listed = await request(app, "GET", "/technologies?q=kaf");
  assert.deepEqual(listed.body.items.map((item: Technology) => item.nome), ["Kafka"]);
});

test("campos fora do vocabulário são rejeitados", async () => {
  const { app } = buildApp("admin");
  const response = await request(app, "POST", "/technologies", { nome: "Go", categoria: "backend", extra: 1 });
  assert.equal(response.status, 400);
});

test("remoção de tecnologia em uso informa associações e exige confirmação da quantidade", async () => {
  const { app, repository } = buildApp("admin");
  const blocked = await request(app, "DELETE", `/technologies/${NODE_ID}`);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, "TECHNOLOGY_IN_USE");
  assert.deepEqual(blocked.body.details.uso, { competencias: 2, itens: 1, total: 3 });
  assert.match(blocked.body.error, /3 associação/);

  const stale = await request(app, "DELETE", `/technologies/${NODE_ID}?confirmar_associacoes=2`);
  assert.equal(stale.status, 409);
  assert.ok(repository.items.has(NODE_ID));

  const confirmed = await request(app, "DELETE", `/technologies/${NODE_ID}?confirmar_associacoes=3`);
  assert.equal(confirmed.status, 200);
  assert.deepEqual(confirmed.body.associacoes_removidas, { competencias: 2, itens: 1, total: 3 });
  assert.equal(repository.items.has(NODE_ID), false);
});

test("confirmação inválida e identificador inválido são rejeitados antes do banco", async () => {
  const { app, repository } = buildApp("admin");
  assert.equal((await request(app, "DELETE", `/technologies/${NODE_ID}?confirmar_associacoes=abc`)).status, 400);
  assert.equal((await request(app, "DELETE", "/technologies/nao-e-uuid")).status, 400);
  assert.equal(repository.calls.some((call) => call.op === "remove"), false);
});

test("somente admin altera ou remove; dev apenas consulta", async () => {
  const { app } = buildApp("dev");
  assert.equal((await request(app, "GET", "/technologies")).status, 200);
  assert.equal((await request(app, "POST", "/technologies", { nome: "Go", categoria: "backend" })).status, 403);

  const po = buildApp("po").app;
  assert.equal((await request(po, "PATCH", `/technologies/${NODE_ID}`, { nome: "Node" })).status, 403);
  assert.equal((await request(po, "DELETE", `/technologies/${NODE_ID}`)).status, 403);
});

test("repositório bloqueia a remoção quando a confirmação não bate com o uso atual", async () => {
  const queries: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql.trim().split(/\s+/).slice(0, 2).join(" "));
      if (sql.includes("FOR UPDATE")) return { rows: [{ id: NODE_ID }] };
      if (sql.includes("FROM tecnologia t")) {
        return { rows: [{ id: NODE_ID, nome: "Node.js", categoria: "backend", competencias: 1, itens: 4 }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const fakePool = { connect: async () => client, query: client.query };
  const repository = new TechnologiesRepository(fakePool as never);

  await assert.rejects(() => repository.remove(NODE_ID, 3, ACTOR), TechnologyInUseError);
  assert.ok(queries.includes("ROLLBACK"));
  assert.equal(queries.some((sql) => sql.startsWith("DELETE FROM")), false);

  queries.length = 0;
  const usage = await repository.remove(NODE_ID, 5, ACTOR);
  assert.deepEqual(usage, { competencias: 1, itens: 4, total: 5 });
  assert.ok(queries.includes("DELETE FROM"));
  assert.ok(queries.includes("INSERT INTO"));
  assert.ok(queries.includes("COMMIT"));
});
