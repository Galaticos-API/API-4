import test from "node:test";
import assert from "node:assert/strict";
import { calculateCompleteness, QualityService } from "./quality.service.js";
import { CriteriaRepository } from "../criteria/criteria.repository.js";
import { PbisRepository } from "../pbis/pbis.repository.js";
import { Criterion, CriterionEntityType } from "../criteria/criteria.types.js";
import { Pbi, PbiWithContext } from "../pbis/pbis.types.js";

const pbiBase: Pbi = {
  id: "pbi-1", feature_id: "feature-1", codigo: "PBI-001", titulo: "Cadastrar item",
  historia_como_um: "Product Owner", historia_eu_quero: "cadastrar um item", historia_para_que: "organizar o backlog",
  regras_observacoes: null, tipo: "Funcional", prioridade: "Must", status: "rascunho",
  score_completude: 0, provenance: "human-authored", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};

class StubCriteriaRepository extends CriteriaRepository {
  constructor(private readonly cenarios: Criterion[]) { super(); }
  async listByEntity(_tipo: CriterionEntityType, _id: string): Promise<Criterion[]> { return this.cenarios; }
}

class StubPbisRepository extends PbisRepository {
  constructor(private readonly pbi: PbiWithContext | null) { super(); }
  async findById(id: string): Promise<PbiWithContext | null> { return this.pbi?.id === id ? this.pbi : null; }
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

test("indicador usa as mesmas regras determinísticas do relatório detalhado", async () => {
  const scenario: Criterion = {
    id: "criterio-2", entidade_tipo: "pbi", entidade_id: pbiBase.id, texto: null,
    nome: "Cadastro", dado: "usuário autenticado", quando: "confirmar", entao: "item criado",
    ordem: 1, created_at: new Date().toISOString(),
  };
  const service = new QualityService(new StubCriteriaRepository([scenario]), new StubPbisRepository(pbiBase));
  const result = await service.validatePbi(pbiBase.id);
  assert.equal(result.checks.length, 4);
  assert.equal(result.score_completude, 100);
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
