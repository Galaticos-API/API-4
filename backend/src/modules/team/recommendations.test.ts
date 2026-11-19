import test from "node:test";
import assert from "node:assert/strict";
import { ADVISORY_NOTICE, RecommendationsService, recommend } from "./recommendations.service.js";
import type { ProfessionalExperience, VocabularyTechnology } from "./team.repository.js";
import { NotFoundError } from "../../shared/errors.js";

const PIX: VocabularyTechnology = { id: "20000000-0000-4000-8000-000000000001", nome: "PIX" };
const NODE: VocabularyTechnology = { id: "20000000-0000-4000-8000-000000000002", nome: "Node.js" };
const FEATURE = "70000000-0000-4000-8000-000000000001";
const PROJECT = "40000000-0000-4000-8000-000000000001";
const VIEWER = "10000000-0000-4000-8000-000000000001";

function person(id: string, nome: string, overrides: Partial<ProfessionalExperience> = {}): ProfessionalExperience {
  return { desenvolvedor_id: id, nome, senioridade: null, competencias: [], projetos: [], ...overrides };
}

const ana = person("a", "Ana", {
  competencias: [
    { tecnologia_id: PIX.id, tecnologia_nome: "PIX", nivel: "especialista", evidencia: "Checkout PIX" },
    { tecnologia_id: NODE.id, tecnologia_nome: "Node.js", nivel: "avancado", evidencia: null },
  ],
});
const bruno = person("b", "Bruno", {
  projetos: [{ projeto_id: PROJECT, projeto_nome: "Atlas", papeis: ["Backend"], em_andamento: false, tecnologias: [PIX], inicio: "2025-01-01T00:00:00Z", fim: null }],
});

test("ordena por aderência e explica cada indicação, inclusive as lacunas", () => {
  const result = recommend([NODE, PIX], [bruno, ana], new Set(["b"]));
  assert.deepEqual(result.map((item) => [item.nome, item.aderencia]), [["Ana", 100], ["Bruno", 50]]);
  assert.match(result[0]!.justificativa, /PIX: competência especialista \(evidência: Checkout PIX\)/);
  assert.match(result[1]!.justificativa, /PIX: atuou em Atlas como Backend\. Sem evidência registrada em Node\.js\./);
  assert.equal(result[1]!.ja_alocado_no_projeto, true);
  assert.equal(result[0]!.ja_alocado_no_projeto, false);
});

test("candidatos sem nenhuma tecnologia da feature não entram e o limite é 5", () => {
  const unrelated = person("x", "Xavier", { competencias: [{ tecnologia_id: "outra", tecnologia_nome: "Go", nivel: "especialista", evidencia: null }] });
  assert.deepEqual(recommend([PIX], [unrelated], new Set()), []);
  const many = Array.from({ length: 8 }, (_, index) => person(`p${index}`, `Pessoa ${index}`, {
    competencias: [{ tecnologia_id: PIX.id, tecnologia_nome: "PIX", nivel: "iniciante", evidencia: null }],
  }));
  assert.equal(recommend([PIX], many, new Set()).length, 5);
});

function fakeRepository(technologies: VocabularyTechnology[] | null, candidates: ProfessionalExperience[] = []) {
  const calls: string[] = [];
  return {
    calls,
    async featureTechnologies() {
      calls.push("feature");
      return technologies === null ? null : { id: FEATURE, titulo: "Checkout", projeto_id: PROJECT, status: "rascunho", tecnologias: technologies };
    },
    async accessibleProjectIds() { calls.push("projects"); return [PROJECT]; },
    async currentlyAllocated() { calls.push("allocated"); return new Set<string>(); },
    async experienceWith() { calls.push("experience"); return candidates; },
  };
}

test("feature sem tecnologias informa base insuficiente sem consultar a equipe", async () => {
  const repository = fakeRepository([]);
  const result = await new RecommendationsService(repository).forFeature(FEATURE, VIEWER);
  assert.equal(result.base_suficiente, false);
  assert.match(result.mensagem, /não possui tecnologias associadas.*não há base suficiente/);
  assert.deepEqual(result.recomendacoes, []);
  assert.deepEqual(repository.calls, ["feature"]);
});

test("tecnologias sem ninguém com experiência também é base insuficiente", async () => {
  const result = await new RecommendationsService(fakeRepository([PIX], [])).forFeature(FEATURE, VIEWER);
  assert.equal(result.base_suficiente, false);
  assert.match(result.mensagem, /Nenhum profissional possui experiência registrada em PIX/);
});

test("recomendação é sempre consultiva e expõe o critério", async () => {
  const result = await new RecommendationsService(fakeRepository([PIX, NODE], [ana, bruno])).forFeature(FEATURE, VIEWER);
  assert.equal(result.base_suficiente, true);
  assert.equal(result.aviso, ADVISORY_NOTICE);
  assert.match(result.aviso, /nenhuma alocação é feita automaticamente/);
  assert.match(result.criterio, /Aderência/);
  assert.equal(result.recomendacoes[0]?.nome, "Ana");
});

test("feature inexistente e identificador inválido", async () => {
  await assert.rejects(() => new RecommendationsService(fakeRepository(null)).forFeature(FEATURE, VIEWER), NotFoundError);
  await assert.rejects(() => new RecommendationsService(fakeRepository([])).forFeature("abc", VIEWER), /UUID/);
});
