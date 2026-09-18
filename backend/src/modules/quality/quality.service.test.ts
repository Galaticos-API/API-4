import test from "node:test";
import assert from "node:assert/strict";
import { QualityService } from "./quality.service.js";
import { CriteriaRepository } from "../criteria/criteria.repository.js";
import { Criterion, CriterionEntityType } from "../criteria/criteria.types.js";
import { Pbi } from "../pbis/pbis.types.js";

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

test("avaliarPbi combina título, história e cenários registrados em um único relatório", async () => {
  const cenario: Criterion = {
    id: "criterio-1", entidade_tipo: "pbi", entidade_id: "pbi-1", texto: null,
    nome: "Cadastro com sucesso", dado: "que eu esteja autenticado", quando: "eu confirmar", entao: "o item deve ser criado",
    ordem: 1, created_at: new Date().toISOString(),
  };
  const service = new QualityService(new StubCriteriaRepository([cenario]));

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
  const service = new QualityService(new StubCriteriaRepository([cenario]));

  const relatorio = await service.avaliarPbi(pbi);

  assert.equal(relatorio.titulo.aprovado, false);
  assert.equal(relatorio.cenarios[0].aprovado, false);
  const termosNoCenario = relatorio.termos_vagos.find((o) => o.campo.startsWith("cenario:"));
  assert.ok(termosNoCenario?.termos.includes("rápido"));
});
