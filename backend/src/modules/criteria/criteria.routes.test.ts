import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { CriteriaController } from "./criteria.controller.js";
import { CriteriaService } from "./criteria.service.js";
import { CriteriaRepository } from "./criteria.repository.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { CreateCriterionDTO, Criterion, CriterionEntityType } from "./criteria.types.js";

const PBI_ID = "d0000000-0000-4000-8000-000000000001";

class MockCriteriaRepo extends CriteriaRepository {
  public criteria: Criterion[] = [];
  private seq = 0;

  constructor() { super(); }

  async entityExists(_tipo: CriterionEntityType, id: string): Promise<boolean> {
    return id === PBI_ID;
  }

  async entityIsWritable(): Promise<boolean> {
    return true;
  }

  async removalBreaksCompletion(): Promise<boolean> {
    return false;
  }

  async findById(id: string): Promise<Criterion | null> {
    return this.criteria.find((c) => c.id === id) ?? null;
  }

  async listByEntity(tipo: CriterionEntityType, entidadeId: string): Promise<Criterion[]> {
    return this.criteria.filter((c) => c.entidade_tipo === tipo && c.entidade_id === entidadeId).sort((a, b) => a.ordem - b.ordem);
  }

  async create(dto: CreateCriterionDTO): Promise<Criterion> {
    this.seq += 1;
    const existentes = await this.listByEntity(dto.entidade_tipo, dto.entidade_id);
    const isScenario = dto.entidade_tipo === "pbi";
    const created: Criterion = {
      id: `e0000000-0000-4000-8000-00000000000${this.seq}`,
      entidade_tipo: dto.entidade_tipo,
      entidade_id: dto.entidade_id,
      texto: isScenario ? null : dto.texto,
      nome: isScenario ? dto.nome : null,
      dado: isScenario ? dto.dado : null,
      quando: isScenario ? dto.quando : null,
      entao: isScenario ? dto.entao : null,
      ordem: existentes.length + 1,
      created_at: new Date().toISOString(),
    };
    this.criteria.push(created);
    return created;
  }

  async delete(id: string): Promise<Criterion | null> {
    const index = this.criteria.findIndex((c) => c.id === id);
    if (index === -1) return null;
    const [removed] = this.criteria.splice(index, 1);
    return removed;
  }

  async move(id: string, direction: "up" | "down"): Promise<Criterion[] | null> {
    const current = this.criteria.find((c) => c.id === id);
    if (!current) return null;

    const irmaos = (await this.listByEntity(current.entidade_tipo, current.entidade_id)).sort((a, b) => a.ordem - b.ordem);
    const indiceAtual = irmaos.findIndex((c) => c.id === id);
    const indiceVizinho = direction === "up" ? indiceAtual - 1 : indiceAtual + 1;
    if (indiceVizinho < 0 || indiceVizinho >= irmaos.length) return irmaos;

    const vizinho = irmaos[indiceVizinho];
    const ordemTemp = current.ordem;
    current.ordem = vizinho.ordem;
    vizinho.ordem = ordemTemp;

    return [...irmaos].sort((a, b) => a.ordem - b.ordem);
  }
}

test("Testes de integração HTTP - Rotas de Critérios de Aceitação", async (t) => {
  const repository = new MockCriteriaRepo();
  const service = new CriteriaService(repository);
  const controller = new CriteriaController(service);

  const testApp = express();
  testApp.use(express.json());

  const router = express.Router();
  router.post("/", controller.create);
  router.get("/", controller.list);
  router.delete("/:id", controller.delete);
  router.patch("/:id/move", controller.move);

  testApp.use("/api/v1/criteria", router);
  testApp.use(errorHandler);

  let server: Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = testApp.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}/api/v1/criteria`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => { server.close(() => resolve()); });
  });

  await t.test("POST /api/v1/criteria - adiciona cenário nomeado de PBI com status 201", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entidade_tipo: "pbi",
        entidade_id: PBI_ID,
        nome: "Cenário via HTTP",
        dado: "que eu esteja autenticado",
        quando: "eu confirmar",
        entao: "o sistema deve responder",
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as Criterion;
    assert.equal(body.nome, "Cenário via HTTP");
  });

  await t.test("POST /api/v1/criteria - retorna 400 quando o cenário está incompleto", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entidade_tipo: "pbi", entidade_id: PBI_ID, nome: "Incompleto", dado: "algo" }),
    });

    assert.equal(res.status, 400);
  });

  await t.test("POST /api/v1/criteria - retorna 404 para entidade inexistente", async () => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entidade_tipo: "epico", entidade_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", texto: "Critério órfão" }),
    });

    assert.equal(res.status, 404);
  });

  await t.test("GET /api/v1/criteria - lista critérios ordenados de uma entidade", async () => {
    const res = await fetch(`${baseUrl}?entidade_tipo=pbi&entidade_id=${PBI_ID}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { items: Criterion[] };
    assert.equal(body.items.length, 1);
  });

  await t.test("DELETE /api/v1/criteria/:id - remove critério existente", async () => {
    const created = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entidade_tipo: "pbi", entidade_id: PBI_ID, nome: "A remover", dado: "d", quando: "q", entao: "e" }),
    }).then((r) => r.json()) as Criterion;

    const res = await fetch(`${baseUrl}/${created.id}`, { method: "DELETE" });
    assert.equal(res.status, 200);
  });

  await t.test("DELETE /api/v1/criteria/:id - retorna 404 para critério inexistente", async () => {
    const res = await fetch(`${baseUrl}/ffffffff-ffff-4fff-8fff-ffffffffffff`, { method: "DELETE" });
    assert.equal(res.status, 404);
  });

  await t.test("PATCH /api/v1/criteria/:id/move - reordena os cenários e persiste a nova ordem", async () => {
    const primeiro = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entidade_tipo: "pbi", entidade_id: PBI_ID, nome: "Vai ficar em segundo", dado: "d", quando: "q", entao: "e" }),
    }).then((r) => r.json()) as Criterion;
    const segundo = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entidade_tipo: "pbi", entidade_id: PBI_ID, nome: "Vai ficar em primeiro", dado: "d", quando: "q", entao: "e" }),
    }).then((r) => r.json()) as Criterion;

    const res = await fetch(`${baseUrl}/${segundo.id}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "up" }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { items: Criterion[] };
    const posicaoSegundo = body.items.findIndex((c) => c.id === segundo.id);
    const posicaoPrimeiro = body.items.findIndex((c) => c.id === primeiro.id);
    assert.ok(posicaoSegundo < posicaoPrimeiro);
  });

  await t.test("PATCH /api/v1/criteria/:id/move - retorna 400 para direção inválida", async () => {
    const res = await fetch(`${baseUrl}/qualquer-id/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction: "sideways" }),
    });
    assert.equal(res.status, 400);
  });
});
