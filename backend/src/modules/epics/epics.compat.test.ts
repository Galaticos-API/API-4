import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { createRequireAuth } from "../../middleware/requireAuth.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { SessionService, type SessionValidationResult } from "../auth/session.service.js";
import { ProjectsRepository } from "../projects/projects.repository.js";
import type { ProjectWithStats } from "../projects/projects.types.js";
import { EpicsRepository } from "./epics.repository.js";
import { EpicsService } from "./epics.service.js";
import { createEpicsRouter } from "./epics.routes.js";
import { createEpicsCompatRouter } from "./epics.compat.routes.js";
import type { CreateEpicDTO, UpdateEpicDTO, EpicWithStats, EpicQueryDTO } from "./epics.types.js";

const projectId = randomUUID();
const userId = randomUUID();
class Sessions extends SessionService {
  async validateSession(token: string): Promise<SessionValidationResult> {
    if (!["po", "dev"].includes(token)) return { valid: false, reason: "not_found" };
    return { valid: true, sessionId: "test", user: {
      id: userId, nome: "QA", email: "qa@example.test", role: token === "po" ? "po" : "dev",
    } };
  }
}
class Projects extends ProjectsRepository {
  archived = false;
  async findById(id: string): Promise<ProjectWithStats | null> {
    return id === projectId ? { id, nome: "QA", cliente: "QA", descricao: null,
      status: this.archived ? "arquivado" : "ativo", data_inicio: new Date(), created_at: new Date(), updated_at: new Date(),
    } : null;
  }
}
class Epics extends EpicsRepository {
  rows: EpicWithStats[] = [];
  authors: (string | null | undefined)[] = [];
  async findById(id: string) { return this.rows.find((row) => row.id === id) ?? null; }
  async create(data: CreateEpicDTO, actor?: string | null) {
    const row: EpicWithStats = { id: randomUUID(), projeto_id: data.projeto_id, titulo: data.titulo,
      descricao: data.descricao ?? null, objetivo: data.objetivo ?? null, escopo_macro: data.escopo_macro ?? null,
      resultado_esperado: data.resultado_esperado ?? null, prioridade: data.prioridade, status: "rascunho",
      created_at: new Date(), updated_at: new Date(), criterios_count: 0 };
    this.rows.push(row); this.authors.push(actor); return row;
  }
  async findAll(query: EpicQueryDTO) {
    const rows = this.rows.filter((row) => !query.projeto_id || row.projeto_id === query.projeto_id);
    return { items: rows.slice(query.offset, query.offset + query.limit), total: rows.length, limit: query.limit, offset: query.offset };
  }
  async update(id: string, data: UpdateEpicDTO, actor?: string | null) {
    const row = await this.findById(id);
    if (!row) return null;
    Object.assign(row, data); this.authors.push(actor); return row;
  }
  async markConcluded(id: string, actor?: string | null) {
    const row = await this.findById(id);
    if (!row) return null;
    row.status = "concluido"; this.authors.push(actor); return row;
  }
}

test("contrato único de épicos em URLs canônicas e aliases", async (t) => {
  const repo = new Epics(); const projects = new Projects();
  const service = new EpicsService(repo, projects);
  const app = express(); app.use(express.json()); app.use(createRequireAuth(new Sessions()));
  app.use("/api/v1/epics", createEpicsRouter(service));
  app.use("/api/v1", createEpicsCompatRouter(service));
  app.use("/api", createEpicsCompatRouter(service)); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (path: string, method = "GET", body?: unknown, role = "po") => fetch(base + path, {
    method, headers: { "Content-Type": "application/json", ...(role ? { Cookie: `sinapse_session=${role}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  for (const prefix of ["/api/v1/epics", "/api/v1", "/api"]) {
    const canonical = prefix.endsWith("epics");
    const collection = canonical ? prefix : `${prefix}/projects/${projectId}/epicos`;
    const detail = (id: string) => canonical ? `${prefix}/${id}` : `${prefix}/epicos/${id}`;
    await t.test(prefix, async () => {
      assert.equal((await call(collection, "GET", undefined, "")).status, 401);
      assert.equal((await call(collection, "POST", { projeto_id: projectId, titulo: "QA" }, "dev")).status, 403);
      assert.equal((await call(detail("invalid"))).status, 400);
      assert.equal((await call(detail(randomUUID()))).status, 404);
      assert.equal((await call(collection, "POST", { projeto_id: projectId, titulo: " " })).status, 400);
      assert.equal((await call(collection, "POST", { projeto_id: projectId, titulo: "QA", status: "concluido" })).status, 400);
      const created = await call(collection, "POST", { projeto_id: projectId, titulo: "QA", priorizacao: "Should" });
      assert.equal(created.status, 201);
      const row = await created.json() as EpicWithStats;
      assert.equal(row.status, "rascunho"); assert.equal(repo.authors.at(-1), userId);
      if (!canonical) assert.equal(row.prioridade, "Should");
      assert.equal((await call(detail(row.id), "PATCH", { status: "concluido" })).status, 400);
      const incomplete = await call(`${detail(row.id)}/complete`, "PATCH");
      assert.equal(incomplete.status, 400);
      const error = await incomplete.json() as { details: { campos_faltantes: string[]; missing?: string[] } };
      assert.ok(error.details.campos_faltantes.includes("criterios_aceitacao"));
      if (!canonical) assert.ok(error.details.missing?.includes("critérios de aceitação"));
      const data = { descricao: "d", objetivo: "o", escopo_macro: "e", resultado_esperado: "r" };
      assert.equal((await call(detail(row.id), "PATCH", data)).status, 200);
      assert.equal((await call(`${detail(row.id)}/complete`, "PATCH")).status, 400);
      repo.rows.find((r) => r.id === row.id)!.criterios_count = 1;
      assert.equal((await call(`${detail(row.id)}/complete`, "PATCH")).status, 200);
      assert.equal(repo.authors.at(-1), userId);
      assert.equal((await call(detail(row.id), "PATCH", { objetivo: " " })).status, 400);
      projects.archived = true;
      assert.equal((await call(detail(row.id), "PATCH", { titulo: "Novo" })).status, 400);
      assert.equal((await call(`${detail(row.id)}/complete`, "PATCH")).status, 400);
      projects.archived = false;
      repo.rows.find((r) => r.id === row.id)!.status = "ativo";
      assert.equal((await call(detail(row.id))).status, 200);
      assert.equal((await call(detail(row.id), "PATCH", { titulo: "Novo" })).status, 200);
      assert.equal((await call(`${detail(row.id)}/complete`, "PATCH")).status, 200);
      repo.rows.find((r) => r.id === row.id)!.status = "arquivado";
      assert.equal((await call(detail(row.id), "PATCH", { titulo: "Bloqueado" })).status, 400);
    });
  }
  await t.test("listagem legada preserva mais de 100 registros e isolamento por projeto", async () => {
    for (let i = 0; i < 105; i++) await service.create({ projeto_id: projectId, titulo: `Item ${i}` });
    const rows = await (await call(`/api/v1/projects/${projectId}/epicos`)).json() as EpicWithStats[];
    assert.equal(rows.length, 108);
    assert.deepEqual(await (await call(`/api/projects/${randomUUID()}/epicos`)).json(), []);
  });
});
