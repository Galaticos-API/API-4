import test from "node:test";
import assert from "node:assert/strict";
import { calculateCompleteness, QualityService } from "./quality.service.js";
import { CriteriaRepository } from "../criteria/criteria.repository.js";
import { PbisRepository } from "../pbis/pbis.repository.js";
import { Criterion, CriterionEntityType } from "../criteria/criteria.types.js";
import { Pbi, PbiWithContext } from "../pbis/pbis.types.js";
import { PBI_QUALITY_CHECKS, PbiQualityRuleConfiguration, QualityRuleConfigurationProvider } from "./quality.types.js";

const pbiBase: Pbi = {
  id: "pbi-1", feature_id: "feature-1", codigo: "PBI-001", titulo: "Cadastrar item",
  historia_como_um: "Product Owner", historia_eu_quero: "cadastrar um item", historia_para_que: "organizar o backlog",
  regras_observacoes: null, tipo: "Funcional", prioridade: "Must", status: "rascunho",
  score_completude: 0, provenance: "human-authored", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

class StubCriteriaRepository extends CriteriaRepository {
  constructor(private readonly cenarios: Criterion[]) { super(); }
  async listByEntity(_tipo: CriterionEntityType, _id: string): Promise<Criterion[]> { return this.cenarios; }
  async listByEntities(_tipo: CriterionEntityType, entityIds: string[]): Promise<Criterion[]> {
    const ids = new Set(entityIds);
    return this.cenarios.filter((criterion) => ids.has(criterion.entidade_id));
  }
}

class StubPbisRepository extends PbisRepository {
  constructor(private readonly pbi: PbiWithContext | null) { super(); }
  async findById(id: string): Promise<PbiWithContext | null> { return this.pbi?.id === id ? this.pbi : null; }
}

class StubQualityRuleConfigurationProvider implements QualityRuleConfigurationProvider {
  constructor(public configuration: PbiQualityRuleConfiguration = {
    rule_version: "test-v1",
    checks: PBI_QUALITY_CHECKS.map((check_id) => ({ check_id, isApplicable: () => true })),
  }) {}

  async getCurrentPbiConfiguration(): Promise<PbiQualityRuleConfiguration> {
    return this.configuration;
  }
}

test("avaliarPbi combina título, história e cenários registrados em um único relatório", async () => {
  const cenario: Criterion = {
    id: "criterio-1", entidade_tipo: "pbi", entidade_id: "pbi-1", texto: null,
    nome: "Cadastro com sucesso", dado: "que eu esteja autenticado", quando: "eu confirmar", entao: "o item deve ser criado",
    ordem: 1, created_at: new Date().toISOString(),
  };
  const service = new QualityService(new StubCriteriaRepository([cenario]), new StubPbisRepository(pbiBase));

  const relatorio = await service.avaliarPbi(pbiBase);

  assert.equal(relatorio.titulo.aprovado, true);
  assert.equal(relatorio.historia.aprovado, true);
  assert.equal(relatorio.cenarios.length, 1);
  assert.equal(relatorio.cenarios[0].aprovado, true);
  assert.equal(relatorio.termos_vagos.length, 0);
});

test("avaliarPbi reprova título fora do padrão e destaca cenário incompleto e termos vagos", async () => {
  const cenario: Criterion = {
    id: "criterio-1", entidade_tipo: "pbi", entidade_id: "pbi-1", texto: null,
    nome: "Cenário incompleto", dado: "algo", quando: "", entao: "o sistema deve ser rápido",
    ordem: 1, created_at: new Date().toISOString(),
  };
  const pbi: Pbi = { ...pbiBase, titulo: "Tela de usuários" };
  const service = new QualityService(new StubCriteriaRepository([cenario]), new StubPbisRepository(pbi));

  const relatorio = await service.avaliarPbi(pbi);

  assert.equal(relatorio.titulo.aprovado, false);
  assert.equal(relatorio.cenarios[0].aprovado, false);
  const termosNoCenario = relatorio.termos_vagos.find((o) => o.campo.startsWith("cenario:"));
  assert.ok(termosNoCenario?.termos.includes("rápido"));
});

test("indicador usa as mesmas regras determinísticas do relatório detalhado e informa a versão", async () => {
  const scenario: Criterion = {
    id: "criterio-2", entidade_tipo: "pbi", entidade_id: pbiBase.id, texto: null,
    nome: "Cadastro", dado: "usuário autenticado", quando: "confirmar", entao: "item criado",
    ordem: 1, created_at: new Date().toISOString(),
  };
  const provider = new StubQualityRuleConfigurationProvider();
  const service = new QualityService(new StubCriteriaRepository([scenario]), new StubPbisRepository(pbiBase), provider);
  const result = await service.validatePbi(pbiBase.id);
  assert.equal(result.checks.length, 4);
  assert.equal(result.score_completude, 100);
  assert.equal(result.rule_version, "test-v1");
});

test("indicador exclui verificações não aplicáveis e retorna nulo quando nenhuma se aplica", () => {
  const checks = [
    { check_id: "ok", check_name: "Aplicável aprovada", passed: true, message: "", applicable: true },
    { check_id: "fail", check_name: "Aplicável reprovada", passed: false, message: "", applicable: true },
    { check_id: "skip", check_name: "Não aplicável", passed: false, message: "", applicable: false },
  ];
  assert.equal(calculateCompleteness(checks), 50);
  assert.equal(calculateCompleteness(checks.map((check) => ({ ...check, passed: false }))), 0);
  assert.equal(calculateCompleteness([checks[2]]), null);
});

test("indicador aplica apenas as verificações ativas e aplicáveis, e recalcula após mudar a configuração", async () => {
  const provider = new StubQualityRuleConfigurationProvider({
    rule_version: "org-v1",
    checks: [
      { check_id: "titulo_infinitivo", isApplicable: () => true },
      { check_id: "historia_completa", isApplicable: () => false },
      { check_id: "cenario_estruturado", isApplicable: () => true },
    ],
  });
  const service = new QualityService(new StubCriteriaRepository([]), new StubPbisRepository(pbiBase), provider);

  const initial = await service.validatePbi(pbiBase.id);
  assert.deepEqual(initial.checks.map((check) => check.check_id), ["titulo_infinitivo", "cenario_estruturado"]);
  assert.equal(initial.score_completude, 50);
  assert.equal(initial.rule_version, "org-v1");

  provider.configuration = {
    rule_version: "org-v2",
    checks: [{ check_id: "titulo_infinitivo", isApplicable: () => true }],
  };
  const afterConfigurationChange = await service.validatePbi(pbiBase.id);
  assert.equal(afterConfigurationChange.checks.length, 1);
  assert.equal(afterConfigurationChange.score_completude, 100);
  assert.equal(afterConfigurationChange.rule_version, "org-v2");
});

test("relatório detalhado considera a lista organizacional vigente de termos vagos", async () => {
  const provider = new StubQualityRuleConfigurationProvider({
    rule_version: "org-v3",
    checks: PBI_QUALITY_CHECKS.map((check_id) => ({ check_id, isApplicable: () => true })),
    vague_terms: ["ambíguo"],
  });
  const service = new QualityService(new StubCriteriaRepository([]), new StubPbisRepository({
    ...pbiBase, titulo: "Cadastrar item ambíguo",
  }), provider);

  const report = await service.avaliarPbi({ ...pbiBase, titulo: "Cadastrar item ambíguo" });

  assert.deepEqual(report.termos_vagos.find((occurrence) => occurrence.campo === "titulo")?.termos, ["ambíguo"]);
});

test("a aplicabilidade é avaliada por PBI e não compartilhada entre itens da mesma página", async () => {
  const provider = new StubQualityRuleConfigurationProvider({
    rule_version: "item-policy-v1",
    checks: [{ check_id: "titulo_infinitivo", isApplicable: (pbi) => pbi.tipo === "Funcional" }],
  });
  const nonFunctionalPbi = { ...pbiBase, id: "pbi-nfr", tipo: "Não Funcional" };
  const service = new QualityService(new StubCriteriaRepository([]), new StubPbisRepository(null), provider);

  const reports = await service.validatePbis([pbiBase, nonFunctionalPbi]);

  assert.equal(reports.get(pbiBase.id)?.score_completude, 100);
  assert.equal(reports.get(nonFunctionalPbi.id)?.checks.length, 0);
  assert.equal(reports.get(nonFunctionalPbi.id)?.score_completude, null);
});

test("indicador retorna null quando nenhuma regra vigente se aplica", async () => {
  const provider = new StubQualityRuleConfigurationProvider({ rule_version: "empty-v1", checks: [] });
  const service = new QualityService(new StubCriteriaRepository([]), new StubPbisRepository(pbiBase), provider);

  const result = await service.validatePbi(pbiBase.id);

  assert.deepEqual(result.checks, []);
  assert.equal(result.score_completude, null);
});

test("indicador de 0% continua válido quando todas as regras aplicáveis falham", async () => {
  const invalidPbi: Pbi = {
    ...pbiBase,
    titulo: "Tela sem verbo",
    historia_como_um: "",
    historia_eu_quero: "",
    historia_para_que: "",
  };
  const provider = new StubQualityRuleConfigurationProvider({
    rule_version: "test-v1",
    checks: [
      { check_id: "titulo_infinitivo", isApplicable: () => true },
      { check_id: "historia_completa", isApplicable: () => true },
    ],
  });
  const service = new QualityService(new StubCriteriaRepository([]), new StubPbisRepository(invalidPbi), provider);

  const result = await service.validatePbi(invalidPbi.id);

  assert.equal(result.score_completude, 0);
  assert.equal(result.checks.every((check) => check.applicable && !check.passed), true);
});

test("listagem calcula uma página com uma única configuração vigente e lote de critérios", async () => {
  const secondPbi = { ...pbiBase, id: "pbi-2" };
  const provider = new StubQualityRuleConfigurationProvider({
    rule_version: "page-v3",
    checks: [{ check_id: "titulo_infinitivo", isApplicable: () => true }],
  });
  let configurationReads = 0;
  provider.getCurrentPbiConfiguration = async () => {
    configurationReads += 1;
    return provider.configuration;
  };
  const criteriaRepository = new StubCriteriaRepository([]);
  let batchReads = 0;
  criteriaRepository.listByEntities = async () => {
    batchReads += 1;
    return [];
  };
  const service = new QualityService(criteriaRepository, new StubPbisRepository(null), provider);

  const reports = await service.validatePbis([pbiBase, secondPbi]);

  assert.equal(configurationReads, 1);
  assert.equal(batchReads, 1);
  assert.equal(reports.get("pbi-1")?.rule_version, "page-v3");
  assert.equal(reports.get("pbi-2")?.score_completude, 100);
});
