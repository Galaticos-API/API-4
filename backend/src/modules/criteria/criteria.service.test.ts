import test from "node:test";
import assert from "node:assert/strict";
import { CriteriaService } from "./criteria.service.js";
import { CriteriaRepository } from "./criteria.repository.js";
import { ValidationError, NotFoundError } from "../../shared/errors.js";
import { CreateCriterionDTO, Criterion, CriterionEntityType } from "./criteria.types.js";

const EPICO_ID = "11111111-1111-4111-8111-111111111111";
const FEATURE_ID = "22222222-2222-4222-8222-222222222222";
const PBI_ID = "33333333-3333-4333-8333-333333333333";
const UNKNOWN_ID = "99999999-9999-4999-8999-999999999999";

class InMemoryCriteriaRepository extends CriteriaRepository {
  private criteria: Criterion[] = [];
  private seq = 0;
  public knownEntities = new Set<string>([EPICO_ID, FEATURE_ID, PBI_ID]);

  constructor() { super(); }

  async entityExists(_tipo: CriterionEntityType, id: string): Promise<boolean> {
    return this.knownEntities.has(id);
  }

  async findById(id: string): Promise<Criterion | null> {
    return this.criteria.find((c) => c.id === id) ?? null;
  }

  async listByEntity(tipo: CriterionEntityType, entidadeId: string): Promise<Criterion[]> {
    return this.criteria
      .filter((c) => c.entidade_tipo === tipo && c.entidade_id === entidadeId)
      .sort((a, b) => a.ordem - b.ordem);
  }

  async countByEntity(tipo: CriterionEntityType, entidadeId: string): Promise<number> {
    return this.criteria.filter((c) => c.entidade_tipo === tipo && c.entidade_id === entidadeId).length;
  }

  async create(dto: CreateCriterionDTO): Promise<Criterion> {
    this.seq += 1;
    const existentes = await this.listByEntity(dto.entidade_tipo, dto.entidade_id);
    const ordem = existentes.length > 0 ? existentes[existentes.length - 1].ordem + 1 : 1;
    const isScenario = dto.entidade_tipo === "pbi";
    const created: Criterion = {
      id: `d9000000-0000-4000-8000-00000000000${this.seq}`,
      entidade_tipo: dto.entidade_tipo,
      entidade_id: dto.entidade_id,
      texto: isScenario ? null : dto.texto,
      nome: isScenario ? dto.nome : null,
      dado: isScenario ? dto.dado : null,
      quando: isScenario ? dto.quando : null,
      entao: isScenario ? dto.entao : null,
      ordem,
      created_at: new Date().toISOString(),
    };
    this.criteria.push(created);
    return created;
  }

  async delete(id: string): Promise<Criterion | null> {
    const index = this.criteria.findIndex((c) => c.id === id);
    if (index === -1) return null;
    const [removed] = this.criteria.splice(index, 1);
    for (const criterion of this.criteria) {
      if (criterion.entidade_tipo === removed.entidade_tipo && criterion.entidade_id === removed.entidade_id && criterion.ordem > removed.ordem) {
        criterion.ordem -= 1;
      }
    }
    return removed;
  }
}

function setup() {
  const repository = new InMemoryCriteriaRepository();
  const service = new CriteriaService(repository);
  return { service, repository };
}

test("PBI-01.2.1 Cenário 1: adiciona critério de texto à lista do épico", async () => {
  const { service } = setup();

  const result = await service.create({ entidade_tipo: "epico", entidade_id: EPICO_ID, texto: "Critério amplo do épico" });

  assert.equal(result.texto, "Critério amplo do épico");
  assert.equal(result.ordem, 1);
});

test("PBI-01.2.1 Cenário 2: mantém múltiplos critérios ordenados ao final da lista", async () => {
  const { service } = setup();

  await service.create({ entidade_tipo: "epico", entidade_id: EPICO_ID, texto: "Primeiro critério" });
  const second = await service.create({ entidade_tipo: "epico", entidade_id: EPICO_ID, texto: "Segundo critério" });

  assert.equal(second.ordem, 2);
  const list = await service.list({ entidade_tipo: "epico", entidade_id: EPICO_ID });
  assert.deepEqual(list.map((c) => c.texto), ["Primeiro critério", "Segundo critério"]);
});

test("PBI-01.2.1 Cenário 3: remove critério e reordena os demais", async () => {
  const { service } = setup();

  const first = await service.create({ entidade_tipo: "epico", entidade_id: EPICO_ID, texto: "Primeiro" });
  await service.create({ entidade_tipo: "epico", entidade_id: EPICO_ID, texto: "Segundo" });
  const third = await service.create({ entidade_tipo: "epico", entidade_id: EPICO_ID, texto: "Terceiro" });

  await service.delete(first.id);

  const list = await service.list({ entidade_tipo: "epico", entidade_id: EPICO_ID });
  assert.deepEqual(list.map((c) => c.texto), ["Segundo", "Terceiro"]);
  assert.equal(list.find((c) => c.id === third.id)?.ordem, 2);
});

test("PBI-01.2.2: registra regra geral de feature como critério de texto", async () => {
  const { service } = setup();

  const result = await service.create({ entidade_tipo: "feature", entidade_id: FEATURE_ID, texto: "Regra geral da feature" });

  assert.equal(result.entidade_tipo, "feature");
  assert.equal(result.texto, "Regra geral da feature");
});

test("PBI-01.2.3 Cenário 1: adiciona cenário completo nomeado ao PBI", async () => {
  const { service } = setup();

  const result = await service.create({
    entidade_tipo: "pbi",
    entidade_id: PBI_ID,
    nome: "Criar item com sucesso",
    dado: "que eu esteja autenticado",
    quando: "eu confirmar a criação",
    entao: "o item deve ser criado",
  });

  assert.equal(result.nome, "Criar item com sucesso");
  assert.equal(result.dado, "que eu esteja autenticado");
  assert.equal(result.texto, null);
});

test("PBI-01.2.3 Cenário 2: impede cenário incompleto sem os blocos DADO/QUANDO/ENTÃO", async () => {
  const { service } = setup();

  await assert.rejects(
    async () => await service.create({ entidade_tipo: "pbi", entidade_id: PBI_ID, nome: "Cenário incompleto", dado: "algo" }),
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      return true;
    },
  );
});

test("PBI-01.2.3 Cenário 3: exige nome do cenário no PBI", async () => {
  const { service } = setup();

  await assert.rejects(
    async () => await service.create({ entidade_tipo: "pbi", entidade_id: PBI_ID, dado: "d", quando: "q", entao: "e" }),
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      return true;
    },
  );
});

test("impede registrar critério para entidade inexistente", async () => {
  const { service } = setup();

  await assert.rejects(
    async () => await service.create({ entidade_tipo: "epico", entidade_id: UNKNOWN_ID, texto: "Critério órfão" }),
    (err: Error) => {
      assert.ok(err instanceof NotFoundError);
      return true;
    },
  );
});
