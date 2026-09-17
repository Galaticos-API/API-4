import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { FeaturesController } from "./features.controller.js";
import { FeaturesService } from "./features.service.js";
import { FeaturesRepository } from "./features.repository.js";
import { EpicsRepository } from "../epics/epics.repository.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { CreateFeatureDTO, Feature, FeatureWithStats, PaginatedFeatures, FeatureQueryDTO } from "./features.types.js";
import { EpicWithStats } from "../epics/epics.types.js";

const EPIC_ID = "e0000000-0000-4000-8000-000000000001";

class MockFeaturesRepo extends FeaturesRepository {
  public features: FeatureWithStats[] = [];
  private seq = 0;

  constructor() { super(); }

  async findById(id: string): Promise<FeatureWithStats | null> {
    return this.features.find((f) => f.id === id) ?? null;
  }

  async create(data: CreateFeatureDTO): Promise<Feature> {
    this.seq += 1;
    const created: FeatureWithStats = {
      id: `f0000000-0000-4000-8000-00000000000${this.seq}`,
      epico_id: data.epico_id,
      titulo: data.titulo.trim(),
      descricao: data.descricao?.trim() ?? null,
      objetivo: data.objetivo?.trim() ?? null,
      prioridade: data.prioridade,
      status: "rascunho",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pbis_count: 0,
      criterios_count: 0,
    };
    this.features.push(created);
    return created;
  }

  async findAll(query: FeatureQueryDTO): Promise<PaginatedFeatures> {
    return { items: this.features, total: this.features.length, limit: query.limit, offset: query.offset };
  }
}

class MockEpicsRepo extends EpicsRepository {
  constructor() { super(); }
  async findById(id: string): Promise<EpicWithStats | null> {
    if (id !== EPIC_ID) return null;
    return {
      id, projeto_id: "proj-1", titulo: "Épico", descricao: null, objetivo: null, escopo_macro: null,
      resultado_esperado: null, prioridade: "Must", status: "rascunho",
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
  }
}

test("Testes de integração HTTP - Rotas de Features", async (t) => {
  const featuresRepo = new MockFeaturesRepo();
  const epicsRepo = new MockEpicsRepo();
  const service = new FeaturesService(featuresRepo, epicsRepo);
  const controller = new FeaturesController(service);

  const testApp = express();
  testApp.use(express.json());

  const router = express.Router();
  router.post("/", controller.create);
  router.get("/", controller.list);
  router.get("/:id", controller.getById);

  testApp.use("/api/v1/features", router);
  testApp.use(errorHandler);

  let server: Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = testApp.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}/api/v1/features`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => { server.close(() => resolve()); });
  });

  await t.test("POST /api/v1/features - cria feature com status 201", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epico_id: EPIC_ID, titulo: "Feature via HTTP" }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as Feature;
    assert.equal(body.titulo, "Feature via HTTP");
  });

  await t.test("POST /api/v1/features - retorna 400 sem épico selecionado", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: "Feature sem épico" }),
    });

    assert.equal(res.status, 400);
  });

  await t.test("POST /api/v1/features - retorna 404 para épico inexistente", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epico_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", titulo: "Feature órfã" }),
    });

    assert.equal(res.status, 404);
  });
});
