import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { PbisController } from "./pbis.controller.js";
import { PbisService } from "./pbis.service.js";
import { PbisRepository } from "./pbis.repository.js";
import { FeaturesRepository } from "../features/features.repository.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { CreatePbiDTO, Pbi, PbiWithContext, PaginatedPbis, PbiQueryDTO } from "./pbis.types.js";
import { FeatureWithStats } from "../features/features.types.js";

const FEATURE_ID = "f0000000-0000-4000-8000-000000000001";

class MockPbisRepo extends PbisRepository {
  public pbis: PbiWithContext[] = [];
  private seq = 0;

  constructor() { super(); }

  async findById(id: string): Promise<PbiWithContext | null> {
    return this.pbis.find((p) => p.id === id) ?? null;
  }

  async create(data: CreatePbiDTO): Promise<Pbi> {
    this.seq += 1;
    const created: PbiWithContext = {
      id: `c0000000-0000-4000-8000-00000000000${this.seq}`,
      feature_id: data.feature_id,
      codigo: `PBI-${String(this.seq).padStart(3, "0")}`,
      titulo: data.titulo.trim(),
      historia_como_um: data.historia_como_um.trim(),
      historia_eu_quero: data.historia_eu_quero.trim(),
      historia_para_que: data.historia_para_que.trim(),
      regras_observacoes: null,
      tipo: data.tipo,
      prioridade: data.prioridade,
      status: "rascunho",
      score_completude: 0,
      provenance: "human-authored",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      criterios_count: 0,
    };
    this.pbis.push(created);
    return created;
  }

  async findAll(query: PbiQueryDTO): Promise<PaginatedPbis> {
    return { items: this.pbis, total: this.pbis.length, limit: query.limit, offset: query.offset };
  }
}

class MockFeaturesRepo extends FeaturesRepository {
  constructor() { super(); }
  async findById(id: string): Promise<FeatureWithStats | null> {
    if (id !== FEATURE_ID) return null;
    return {
      id, epico_id: "epic-1", titulo: "Feature", descricao: "d", objetivo: "o",
      prioridade: "Must", status: "rascunho", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
  }
}

test("Testes de integração HTTP - Rotas de PBIs", async (t) => {
  const pbisRepo = new MockPbisRepo();
  const featuresRepo = new MockFeaturesRepo();
  const service = new PbisService(pbisRepo, featuresRepo);
  const controller = new PbisController(service);

  const testApp = express();
  testApp.use(express.json());

  const router = express.Router();
  router.post("/", controller.create);
  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.patch("/:id/complete", controller.complete);

  testApp.use("/api/v1/pbis", router);
  testApp.use(errorHandler);

  let server: Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = testApp.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}/api/v1/pbis`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => { server.close(() => resolve()); });
  });

  await t.test("POST /api/v1/pbis - cria PBI com história completa e status 201", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature_id: FEATURE_ID,
        titulo: "Cadastrar PBI via HTTP",
        historia_como_um: "Product Owner",
        historia_eu_quero: "cadastrar um PBI",
        historia_para_que: "descrever o comportamento esperado",
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as Pbi;
    assert.equal(body.status, "rascunho");
    assert.match(body.codigo, /^PBI-\d{3}$/);
  });

  await t.test("POST /api/v1/pbis - retorna 400 quando falta um bloco da história", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feature_id: FEATURE_ID, titulo: "PBI incompleto", historia_como_um: "PO", historia_eu_quero: "algo" }),
    });

    assert.equal(res.status, 400);
  });

  await t.test("PATCH /api/v1/pbis/:id/complete - retorna 400 sem cenário de aceitação", async () => {
    const created = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature_id: FEATURE_ID,
        titulo: "PBI sem cenário",
        historia_como_um: "PO",
        historia_eu_quero: "algo",
        historia_para_que: "algo",
      }),
    }).then((r) => r.json()) as Pbi;

    const res = await fetch(`${baseUrl}/${created.id}/complete`, { method: "PATCH" });
    assert.equal(res.status, 400);
  });
});
