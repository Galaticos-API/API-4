import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { EpicsController } from "./epics.controller.js";
import { EpicsService } from "./epics.service.js";
import { EpicsRepository } from "./epics.repository.js";
import { ProjectsRepository } from "../projects/projects.repository.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { CreateEpicDTO, UpdateEpicDTO, Epic, EpicWithStats, PaginatedEpics, EpicQueryDTO } from "./epics.types.js";
import { ProjectWithStats } from "../projects/projects.types.js";

class MockEpicsRepo extends EpicsRepository {
  public epics: EpicWithStats[] = [];
  private seq = 0;

  constructor() { super(); }

  async findById(id: string): Promise<EpicWithStats | null> {
    return this.epics.find((e) => e.id === id) ?? null;
  }

  async create(data: CreateEpicDTO): Promise<Epic> {
    this.seq += 1;
    const created: EpicWithStats = {
      id: `a0000000-0000-4000-8000-00000000000${this.seq}`,
      projeto_id: data.projeto_id,
      titulo: data.titulo.trim(),
      descricao: data.descricao?.trim() ?? null,
      objetivo: data.objetivo?.trim() ?? null,
      escopo_macro: data.escopo_macro?.trim() ?? null,
      resultado_esperado: data.resultado_esperado?.trim() ?? null,
      prioridade: data.prioridade,
      status: "rascunho",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      features_count: 0,
      criterios_count: 0,
    };
    this.epics.push(created);
    return created;
  }

  async findAll(query: EpicQueryDTO): Promise<PaginatedEpics> {
    return { items: this.epics, total: this.epics.length, limit: query.limit, offset: query.offset };
  }

  async update(_id: string, _data: UpdateEpicDTO): Promise<EpicWithStats | null> { throw new Error("não usado"); }
  async markConcluded(): Promise<EpicWithStats | null> { throw new Error("não usado"); }
}

class MockProjectsRepo extends ProjectsRepository {
  constructor() { super(); }
  async findById(id: string): Promise<ProjectWithStats | null> {
    if (id !== "d0000000-0000-4000-8000-000000000001") return null;
    return {
      id, nome: "Projeto Teste", cliente: "Cliente", descricao: null, status: "ativo",
      data_inicio: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
  }
}

test("Testes de integração HTTP - Rotas de Épicos", async (t) => {
  const epicsRepo = new MockEpicsRepo();
  const projectsRepo = new MockProjectsRepo();
  const service = new EpicsService(epicsRepo, projectsRepo);
  const controller = new EpicsController(service);

  const testApp = express();
  testApp.use(express.json());

  const router = express.Router();
  router.post("/", controller.create);
  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.patch("/:id/complete", controller.complete);

  testApp.use("/api/v1/epics", router);
  testApp.use(errorHandler);

  let server: Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = testApp.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}/api/v1/epics`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => { server.close(() => resolve()); });
  });

  await t.test("POST /api/v1/epics - cria épico com status 201", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projeto_id: "d0000000-0000-4000-8000-000000000001", titulo: "Épico via HTTP" }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as Epic;
    assert.equal(body.titulo, "Épico via HTTP");
    assert.equal(body.status, "rascunho");
  });

  await t.test("POST /api/v1/epics - retorna 404 se o projeto não existir", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projeto_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", titulo: "Épico órfão" }),
    });

    assert.equal(res.status, 404);
  });

  await t.test("GET /api/v1/epics - lista épicos com status 200", async () => {
    const res = await fetch(baseUrl);
    assert.equal(res.status, 200);
    const body = (await res.json()) as PaginatedEpics;
    assert.ok(Array.isArray(body.items));
  });

  await t.test("PATCH /api/v1/epics/:id/complete - retorna 400 quando faltam campos obrigatórios", async () => {
    const created = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projeto_id: "d0000000-0000-4000-8000-000000000001", titulo: "Épico incompleto" }),
    }).then((r) => r.json()) as Epic;

    const res = await fetch(`${baseUrl}/${created.id}/complete`, { method: "PATCH" });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { code: string; details: { campos_faltantes: string[] } };
    assert.equal(body.code, "VALIDATION_ERROR");
    assert.ok(body.details.campos_faltantes.length > 0);
  });
});
