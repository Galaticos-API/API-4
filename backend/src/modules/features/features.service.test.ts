import test from "node:test";
import assert from "node:assert/strict";
import { FeaturesService } from "./features.service.js";
import { FeaturesRepository } from "./features.repository.js";
import { EpicsRepository } from "../epics/epics.repository.js";
import { ValidationError, NotFoundError } from "../../shared/errors.js";
import { CreateFeatureDTO, UpdateFeatureDTO, Feature, FeatureWithStats, PaginatedFeatures, FeatureQueryDTO } from "./features.types.js";
import { EpicWithStats } from "../epics/epics.types.js";

const EPICO_ID = "c0000000-0000-4000-8000-000000000001";

class InMemoryFeaturesRepository extends FeaturesRepository {
  private features: FeatureWithStats[] = [];
  public statusProjeto = "ativo";
  private seq = 0;

  constructor() { super(); }

  async findById(id: string): Promise<FeatureWithStats | null> {
    const found = this.features.find((f) => f.id === id);
    return found ? { ...found, projeto_status: this.statusProjeto } : null;
  }

  async create(data: CreateFeatureDTO): Promise<Feature> {
    this.seq += 1;
    const created: FeatureWithStats = {
      id: `b0000000-0000-4000-8000-00000000000${this.seq}`,
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
      epico_titulo: "Épico de teste",
      projeto_id: "d0000000-0000-4000-8000-000000000001",
    };
    this.features.push(created);
    return created;
  }

  async findAll(query: FeatureQueryDTO): Promise<PaginatedFeatures> {
    const items = this.features.filter((f) => !query.epico_id || f.epico_id === query.epico_id);
    return { items, total: items.length, limit: query.limit, offset: query.offset };
  }

  async update(id: string, data: UpdateFeatureDTO): Promise<FeatureWithStats | null> {
    const index = this.features.findIndex((f) => f.id === id);
    if (index === -1) return null;
    this.features[index] = {
      ...this.features[index],
      ...(data.titulo !== undefined ? { titulo: data.titulo.trim() } : {}),
      ...(data.descricao !== undefined ? { descricao: data.descricao?.trim() ?? null } : {}),
      ...(data.objetivo !== undefined ? { objetivo: data.objetivo?.trim() ?? null } : {}),
    };
    return this.features[index];
  }

  async markConcluded(id: string): Promise<FeatureWithStats | null> {
    const index = this.features.findIndex((f) => f.id === id);
    if (index === -1) return null;
    this.features[index] = { ...this.features[index], status: "concluido" };
    return this.features[index];
  }
}

class StubEpicsRepository extends EpicsRepository {
  public epics: EpicWithStats[] = [];
  constructor() { super(); }
  async findById(id: string): Promise<EpicWithStats | null> {
    return this.epics.find((e) => e.id === id) ?? null;
  }
}

function setup() {
  const featuresRepo = new InMemoryFeaturesRepository();
  const epicsRepo = new StubEpicsRepository();
  epicsRepo.epics.push({
    id: EPICO_ID, projeto_id: "d0000000-0000-4000-8000-000000000001", titulo: "Épico base", descricao: null, objetivo: null,
    escopo_macro: null, resultado_esperado: null, prioridade: "Must", status: "rascunho",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  const service = new FeaturesService(featuresRepo, epicsRepo);
  return { service, featuresRepo, epicsRepo };
}

test("PBI-01.1.3 Cenário 1: cria feature completa vinculada ao épico com status rascunho", async () => {
  const { service } = setup();

  const result = await service.create({ epico_id: EPICO_ID, titulo: "Estruturação dos itens", descricao: "d", objetivo: "o" });

  assert.equal(result.titulo, "Estruturação dos itens");
  assert.equal(result.status, "rascunho");
  assert.equal(result.epico_id, EPICO_ID);
});

test("PBI-01.1.3 Cenário 2: exibe o épico de origem ao consultar a feature", async () => {
  const { service } = setup();

  const created = await service.create({ epico_id: EPICO_ID, titulo: "Feature com contexto" });
  const found = await service.getById(created.id);

  assert.equal(found.epico_titulo, "Épico de teste");
  assert.equal(found.projeto_id, "d0000000-0000-4000-8000-000000000001");
});

test("PBI-01.1.3 Cenário 3: impede criação de feature em épico inexistente", async () => {
  const { service } = setup();

  await assert.rejects(
    async () => await service.create({ epico_id: "99999999-9999-4999-8999-999999999999", titulo: "Feature órfã" }),
    (err: Error) => {
      assert.ok(err instanceof NotFoundError);
      return true;
    },
  );
});

test("impede conclusão de feature sem descrição ou objetivo", async () => {
  const { service } = setup();

  const created = await service.create({ epico_id: EPICO_ID, titulo: "Feature incompleta" });

  await assert.rejects(
    async () => await service.complete(created.id),
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      const details = (err as ValidationError).details as { campos_faltantes: string[] };
      assert.deepEqual(details.campos_faltantes.sort(), ["descricao", "objetivo"]);
      return true;
    },
  );
});

test("PBI-01.1.5 Cenário 3: impede edição e conclusão de feature cujo projeto foi arquivado", async () => {
  const { service, featuresRepo } = setup();

  const created = await service.create({ epico_id: EPICO_ID, titulo: "Feature a ser arquivada", descricao: "d", objetivo: "o" });
  featuresRepo.statusProjeto = "arquivado";

  await assert.rejects(
    async () => await service.update(created.id, { titulo: "Tentativa de edição" }),
    (err: Error) => { assert.ok(err instanceof ValidationError); return true; },
  );

  await assert.rejects(
    async () => await service.complete(created.id),
    (err: Error) => { assert.ok(err instanceof ValidationError); return true; },
  );
});

test("impede cadastrar feature em épico com estado legado", async () => {
  const { service, epicsRepo } = setup();
  const LEGACY_EPICO_ID = "c0000000-0000-4000-8000-000000000099";
  epicsRepo.epics.push({
    id: LEGACY_EPICO_ID, projeto_id: "d0000000-0000-4000-8000-000000000001", titulo: "Épico legado", descricao: null, objetivo: null,
    escopo_macro: null, resultado_esperado: null, prioridade: "Must", status: "ativo",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });

  await assert.rejects(
    async () => await service.create({ epico_id: LEGACY_EPICO_ID, titulo: "Feature nova" }),
    (err: Error) => { assert.ok(err instanceof ValidationError); return true; },
  );
});

test("impede cadastrar feature em épico de projeto arquivado", async () => {
  const { service, epicsRepo } = setup();
  const EPICO_PROJETO_ARQUIVADO = "c0000000-0000-4000-8000-000000000098";
  epicsRepo.epics.push({
    id: EPICO_PROJETO_ARQUIVADO, projeto_id: "d0000000-0000-4000-8000-000000000001", titulo: "Épico órfão", descricao: null, objetivo: null,
    escopo_macro: null, resultado_esperado: null, prioridade: "Must", status: "rascunho", projeto_status: "arquivado",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });

  await assert.rejects(
    async () => await service.create({ epico_id: EPICO_PROJETO_ARQUIVADO, titulo: "Feature nova" }),
    (err: Error) => { assert.ok(err instanceof ValidationError); return true; },
  );
});
