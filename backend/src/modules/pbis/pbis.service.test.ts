import test from "node:test";
import assert from "node:assert/strict";
import { PbisService } from "./pbis.service.js";
import { PbisRepository } from "./pbis.repository.js";
import { FeaturesRepository } from "../features/features.repository.js";
import { ValidationError, NotFoundError } from "../../shared/errors.js";
import { CreatePbiDTO, Pbi, PbiWithContext, PaginatedPbis, PbiQueryDTO } from "./pbis.types.js";
import { FeatureWithStats } from "../features/features.types.js";
import { CriteriaRepository } from "../criteria/criteria.repository.js";
import { Criterion, CriterionEntityType } from "../criteria/criteria.types.js";
import { QualityService } from "../quality/quality.service.js";

const FEATURE_ID = "b0000000-0000-4000-8000-000000000001";

class InMemoryPbisRepository extends PbisRepository {
  private pbis: PbiWithContext[] = [];
  public criteriosPorPbi = new Map<string, number>();
  public statusProjeto = "ativo";
  private seq = 0;

  constructor() { super(); }

  async findById(id: string): Promise<PbiWithContext | null> {
    const found = this.pbis.find((p) => p.id === id);
    if (!found) return null;
    return { ...found, criterios_count: this.criteriosPorPbi.get(id) ?? 0, projeto_status: this.statusProjeto };
  }

  async create(data: CreatePbiDTO): Promise<Pbi> {
    this.seq += 1;
    const created: PbiWithContext = {
      id: `c9000000-0000-4000-8000-00000000000${this.seq}`,
      feature_id: data.feature_id,
      codigo: `PBI-${String(this.seq).padStart(3, "0")}`,
      titulo: data.titulo.trim(),
      historia_como_um: data.historia_como_um.trim(),
      historia_eu_quero: data.historia_eu_quero.trim(),
      historia_para_que: data.historia_para_que.trim(),
      regras_observacoes: data.regras_observacoes?.trim() ?? null,
      tipo: data.tipo,
      prioridade: data.prioridade,
      requer_interface: data.requer_interface,
      status: "rascunho",
      score_completude: 0,
      provenance: "human-authored",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      criterios_count: 0,
      feature_titulo: "Feature de teste",
    };
    this.pbis.push(created);
    return created;
  }

  async findAll(query: PbiQueryDTO): Promise<PaginatedPbis> {
    const items = this.pbis.filter((p) => !query.feature_id || p.feature_id === query.feature_id);
    return { items, total: items.length, limit: query.limit, offset: query.offset };
  }

  setCachedScore(id: string, score: number): void {
    const pbi = this.pbis.find((item) => item.id === id);
    if (pbi) pbi.score_completude = score;
  }

  async markConcluded(id: string): Promise<PbiWithContext | null> {
    const index = this.pbis.findIndex((p) => p.id === id);
    if (index === -1) return null;
    this.pbis[index] = { ...this.pbis[index], status: "concluido" };
    return { ...this.pbis[index], criterios_count: this.criteriosPorPbi.get(id) ?? 0 };
  }
}

class StubFeaturesRepository extends FeaturesRepository {
  public features: FeatureWithStats[] = [];
  constructor() { super(); }
  async findById(id: string): Promise<FeatureWithStats | null> {
    return this.features.find((f) => f.id === id) ?? null;
  }
}

class StubCriteriaRepository extends CriteriaRepository {
  public cenariosPorPbi = new Map<string, Criterion[]>();
  constructor() { super(); }
  async listByEntity(_tipo: CriterionEntityType, id: string): Promise<Criterion[]> {
    return this.cenariosPorPbi.get(id) ?? [];
  }

  async listByEntities(_tipo: CriterionEntityType, ids: string[]): Promise<Criterion[]> {
    return ids.flatMap((id) => this.cenariosPorPbi.get(id) ?? []);
  }
}

function setup() {
  const pbisRepo = new InMemoryPbisRepository();
  const featuresRepo = new StubFeaturesRepository();
  const criteriaRepo = new StubCriteriaRepository();
  featuresRepo.features.push({
    id: FEATURE_ID, epico_id: "c0000000-0000-4000-8000-000000000001", titulo: "Feature base", descricao: null, objetivo: null,
    prioridade: "Must", status: "rascunho", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  const service = new PbisService(pbisRepo, featuresRepo, new QualityService(criteriaRepo, pbisRepo));
  return { service, pbisRepo, featuresRepo, criteriaRepo };
}

test("PBI-01.1.4 Cenário 1: cria PBI com história completa vinculado à feature com status rascunho", async () => {
  const { service } = setup();

  const result = await service.create({
    feature_id: FEATURE_ID,
    titulo: "Cadastrar item",
    historia_como_um: "Product Owner",
    historia_eu_quero: "cadastrar um item",
    historia_para_que: "eu organize o backlog",
  });

  assert.equal(result.status, "rascunho");
  assert.match(result.codigo, /^PBI-\d{3}$/);
  assert.equal(result.requer_interface, false);
});

test("listagem recalcula completude quando os cenários mudam sem confiar no valor persistido", async () => {
  const { service, pbisRepo, criteriaRepo } = setup();
  const created = await service.create({
    feature_id: FEATURE_ID,
    titulo: "Cadastrar item",
    historia_como_um: "Product Owner",
    historia_eu_quero: "cadastrar item",
    historia_para_que: "organizar backlog",
  });

  pbisRepo.setCachedScore(created.id, 0);
  criteriaRepo.cenariosPorPbi.set(created.id, [{
    id: "criterion-1", entidade_tipo: "pbi", entidade_id: created.id, texto: null,
    nome: "Cenário", dado: "usuário autenticado", quando: "confirmar", entao: "item criado",
    ordem: 1, created_at: new Date().toISOString(),
  }]);
  const withScenario = await service.list({ feature_id: FEATURE_ID });
  assert.equal(withScenario.items[0].score_completude, 100);

  pbisRepo.setCachedScore(created.id, 100);
  criteriaRepo.cenariosPorPbi.set(created.id, []);
  const withoutScenario = await service.list({ feature_id: FEATURE_ID });
  assert.equal(withoutScenario.items[0].score_completude, 75);
});

test("PBI-01.1.4 Cenário 3: impede conclusão sem nenhum cenário de aceitação", async () => {
  const { service } = setup();

  const created = await service.create({
    feature_id: FEATURE_ID,
    titulo: "Cadastrar item",
    historia_como_um: "Product Owner",
    historia_eu_quero: "cadastrar um item",
    historia_para_que: "eu organize o backlog",
  });

  await assert.rejects(
    async () => await service.complete(created.id),
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      return true;
    },
  );
});

test("permite concluir PBI após registrar ao menos um cenário de aceitação", async () => {
  const { service, pbisRepo } = setup();

  const created = await service.create({
    feature_id: FEATURE_ID,
    titulo: "Cadastrar item",
    historia_como_um: "Product Owner",
    historia_eu_quero: "cadastrar um item",
    historia_para_que: "eu organize o backlog",
  });

  pbisRepo.criteriosPorPbi.set(created.id, 1);
  const completed = await service.complete(created.id);
  assert.equal(completed.status, "concluido");
});

test("impede cadastro de PBI em feature inexistente", async () => {
  const { service } = setup();

  await assert.rejects(
    async () => await service.create({
      feature_id: "99999999-9999-4999-8999-999999999999",
      titulo: "PBI órfão",
      historia_como_um: "PO",
      historia_eu_quero: "algo",
      historia_para_que: "algo",
    }),
    (err: Error) => {
      assert.ok(err instanceof NotFoundError);
      return true;
    },
  );
});

test("PBI-01.1.4 Cenário 2: exige os três blocos da história separadamente", async () => {
  const { service } = setup();

  await assert.rejects(
    async () => await service.create({
      feature_id: FEATURE_ID,
      titulo: "PBI incompleto",
      historia_como_um: "",
      historia_eu_quero: "",
      historia_para_que: "",
    }),
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      return true;
    },
  );
});

test("PBI-01.3.1 Cenário 3: impede conclusão de PBI com título fora do padrão de infinitivo", async () => {
  const { service, pbisRepo } = setup();

  const created = await service.create({
    feature_id: FEATURE_ID,
    titulo: "Tela de usuários",
    historia_como_um: "Product Owner",
    historia_eu_quero: "cadastrar um item",
    historia_para_que: "eu organize o backlog",
  });
  pbisRepo.criteriosPorPbi.set(created.id, 1);

  await assert.rejects(
    async () => await service.complete(created.id),
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      const details = (err as ValidationError).details as { campos_faltantes: string[] };
      assert.ok(details.campos_faltantes.includes("titulo_infinitivo"));
      return true;
    },
  );
});

test("PBI-01.1.5 Cenário 3: impede edição e conclusão de PBI cujo projeto foi arquivado", async () => {
  const { service, pbisRepo } = setup();

  const created = await service.create({
    feature_id: FEATURE_ID,
    titulo: "Cadastrar item",
    historia_como_um: "Product Owner",
    historia_eu_quero: "cadastrar um item",
    historia_para_que: "eu organize o backlog",
  });
  pbisRepo.statusProjeto = "arquivado";

  await assert.rejects(
    async () => await service.update(created.id, { titulo: "Tentar renomear" }),
    (err: Error) => { assert.ok(err instanceof ValidationError); return true; },
  );

  await assert.rejects(
    async () => await service.complete(created.id),
    (err: Error) => { assert.ok(err instanceof ValidationError); return true; },
  );
});

test("quality() retorna o relatório determinístico combinando título, história e cenários do PBI", async () => {
  const { service, criteriaRepo } = setup();

  const created = await service.create({
    feature_id: FEATURE_ID,
    titulo: "Tela de usuários",
    historia_como_um: "Product Owner",
    historia_eu_quero: "cadastrar um item",
    historia_para_que: "eu organize o backlog",
  });
  criteriaRepo.cenariosPorPbi.set(created.id, [
    { id: "c1", entidade_tipo: "pbi", entidade_id: created.id, texto: null, nome: "Cenário", dado: "d", quando: "q", entao: "o sistema deve ser rápido", ordem: 1, created_at: new Date().toISOString() },
  ]);

  const relatorio = await service.quality(created.id);

  assert.equal(relatorio.titulo.aprovado, false);
  assert.equal(relatorio.cenarios[0].aprovado, true);
  assert.ok(relatorio.termos_vagos.some((o) => o.termos.includes("rápido")));
});

test("impede cadastrar PBI em feature de projeto arquivado", async () => {
  const { service, featuresRepo } = setup();
  const FEATURE_PROJETO_ARQUIVADO = "b0000000-0000-4000-8000-000000000099";
  featuresRepo.features.push({
    id: FEATURE_PROJETO_ARQUIVADO, epico_id: "c0000000-0000-4000-8000-000000000001", titulo: "Feature órfã", descricao: "d", objetivo: "o",
    prioridade: "Must", status: "rascunho", projeto_status: "arquivado",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });

  await assert.rejects(
    async () => await service.create({
      feature_id: FEATURE_PROJETO_ARQUIVADO,
      titulo: "Cadastrar item",
      historia_como_um: "PO",
      historia_eu_quero: "algo",
      historia_para_que: "algo",
    }),
    (err: Error) => { assert.ok(err instanceof ValidationError); return true; },
  );
});

test("PBI-01.3.4 Cenário 2: permite concluir PBI com termos vagos sem bloqueio", async () => {
  const { service, pbisRepo, criteriaRepo } = setup();

  const created = await service.create({
    feature_id: FEATURE_ID,
    titulo: "Cadastrar item",
    historia_como_um: "Product Owner",
    historia_eu_quero: "um sistema rápido", // termo vago
    historia_para_que: "fique bonito",      // termo vago
  });

  pbisRepo.criteriosPorPbi.set(created.id, 1);
  criteriaRepo.cenariosPorPbi.set(created.id, [
    { id: "c1", entidade_tipo: "pbi", entidade_id: created.id, texto: null, nome: "Cenário", dado: "d", quando: "q", entao: "e", ordem: 1, created_at: new Date().toISOString() },
  ]);

  const completed = await service.complete(created.id);
  assert.equal(completed.status, "concluido");
});

test("permite concluir PBI com título fora do infinitivo quando regra titulo_infinitivo está desabilitada", async () => {
  const pbisRepo = new InMemoryPbisRepository();
  const featuresRepo = new StubFeaturesRepository();
  const criteriaRepo = new StubCriteriaRepository();
  featuresRepo.features.push({
    id: FEATURE_ID, epico_id: "c0000000-0000-4000-8000-000000000001", titulo: "Feature base", descricao: null, objetivo: null,
    prioridade: "Must", status: "rascunho", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });

  // Provedor com titulo_infinitivo desabilitado
  const customRulesProvider = {
    async getCurrentPbiConfiguration() {
      return {
        rule_version: "custom-v1",
        checks: [
          { check_id: "cenario_estruturado" as const, isApplicable: () => true },
          { check_id: "historia_completa" as const, isApplicable: () => true },
        ],
      };
    },
  };

  const service = new PbisService(pbisRepo, featuresRepo, new QualityService(criteriaRepo, pbisRepo, customRulesProvider));

  const created = await service.create({
    feature_id: FEATURE_ID,
    titulo: "Tela de usuários", // fora do infinitivo, mas regra está desabilitada
    historia_como_um: "PO",
    historia_eu_quero: "acessar a tela",
    historia_para_que: "gerenciar acessos",
  });

  pbisRepo.criteriosPorPbi.set(created.id, 1);
  criteriaRepo.cenariosPorPbi.set(created.id, [
    { id: "c1", entidade_tipo: "pbi", entidade_id: created.id, texto: null, nome: "Cenário", dado: "d", quando: "q", entao: "e", ordem: 1, created_at: new Date().toISOString() },
  ]);

  const completed = await service.complete(created.id);
  assert.equal(completed.status, "concluido");
});

test("permite concluir PBI sem cenário quando cenario_estruturado está desabilitada", async () => {
  const pbisRepo = new InMemoryPbisRepository();
  const featuresRepo = new StubFeaturesRepository();
  const criteriaRepo = new StubCriteriaRepository();
  featuresRepo.features.push({
    id: FEATURE_ID, epico_id: "c0000000-0000-4000-8000-000000000001", titulo: "Feature base", descricao: null, objetivo: null,
    prioridade: "Must", status: "rascunho", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  const rulesProvider = { async getCurrentPbiConfiguration() {
    return { rule_version: "no-scenarios", checks: [
      { check_id: "titulo_infinitivo" as const, isApplicable: () => true },
      { check_id: "historia_completa" as const, isApplicable: () => true },
    ] };
  } };
  const service = new PbisService(pbisRepo, featuresRepo, new QualityService(criteriaRepo, pbisRepo, rulesProvider));
  const created = await service.create({ feature_id: FEATURE_ID, titulo: "Cadastrar item", historia_como_um: "PO", historia_eu_quero: "registrar", historia_para_que: "organizar" });
  assert.equal((await service.complete(created.id)).status, "concluido");
});
