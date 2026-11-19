import test from "node:test";
import assert from "node:assert/strict";
import { ChatService } from "../chat/chat.service.js";
import type { ChatRepository } from "../chat/chat.repository.js";
import {
  TeamKnowledgeService,
  matchVocabulary,
  rankExperience,
  teamTechnologyQuestion,
} from "./team.service.js";
import type { ProfessionalExperience, VocabularyTechnology } from "./team.repository.js";

const PIX: VocabularyTechnology = { id: "20000000-0000-4000-8000-000000000001", nome: "PIX" };
const NODE: VocabularyTechnology = { id: "20000000-0000-4000-8000-000000000002", nome: "Node.js" };
const C: VocabularyTechnology = { id: "20000000-0000-4000-8000-000000000003", nome: "C" };
const VOCABULARY = [PIX, NODE, C];
const PROJECT = "40000000-0000-4000-8000-000000000001";

test("reconhece perguntas sobre experiência da equipe e extrai a tecnologia", () => {
  assert.equal(teamTechnologyQuestion("quem já trabalhou com integração PIX?"), "integração PIX");
  assert.equal(teamTechnologyQuestion("Quem conhece Node.js na equipe?"), "Node.js");
  assert.equal(teamTechnologyQuestion("Alguém tem experiência em React?"), "React");
  assert.equal(teamTechnologyQuestion("quem domina   PostgreSQL aqui?"), "PostgreSQL");
  assert.equal(teamTechnologyQuestion("Quais são os especialistas em Docker?"), null);
  assert.equal(teamTechnologyQuestion("Quem são os especialistas em Docker?"), "Docker");
  for (const other of ["Quem decidiu usar Redis?", "Qual a decisão sobre PIX?", "quem trabalhou no projeto Atlas?", "O que é PIX?"]) {
    assert.equal(teamTechnologyQuestion(other), null, other);
  }
});

test("casa o termo com o vocabulário sem confundir nomes curtos", () => {
  assert.deepEqual(matchVocabulary("integração PIX", VOCABULARY), [PIX]);
  assert.deepEqual(matchVocabulary("NodeJS", VOCABULARY), [NODE]);
  assert.deepEqual(matchVocabulary("Cobol", VOCABULARY), []);
  assert.deepEqual(matchVocabulary("C", VOCABULARY), [C]);
  assert.deepEqual(matchVocabulary("Kotlin", VOCABULARY), []);
});

function experience(overrides: Partial<ProfessionalExperience>): ProfessionalExperience {
  return { desenvolvedor_id: "d", nome: "Pessoa", senioridade: null, competencias: [], projetos: [], ...overrides };
}

test("ordena priorizando projetos reais sobre nível declarado", () => {
  const ranked = rankExperience([
    experience({ desenvolvedor_id: "a", nome: "Ana", competencias: [{ tecnologia_id: PIX.id, tecnologia_nome: "PIX", nivel: "especialista", evidencia: null }] }),
    experience({
      desenvolvedor_id: "b", nome: "Bruno",
      competencias: [{ tecnologia_id: PIX.id, tecnologia_nome: "PIX", nivel: "intermediario", evidencia: null }],
      projetos: [{ projeto_id: PROJECT, projeto_nome: "Atlas", papeis: ["Backend"], em_andamento: false, tecnologias: [PIX], inicio: "2025-01-01T00:00:00Z", fim: null }],
    }),
  ]);
  assert.deepEqual(ranked.map((item) => item.nome), ["Bruno", "Ana"]);
});

function fakeTeamRepository(items: ProfessionalExperience[]) {
  const calls: Array<{ ids: string[]; projects: string[] }> = [];
  return {
    calls,
    async vocabulary() { return VOCABULARY; },
    async experienceWith(ids: string[], projects: string[]) { calls.push({ ids, projects }); return items; },
  };
}

test("lista profissionais, projetos e evidências que fundamentam a resposta", async () => {
  const repository = fakeTeamRepository([
    experience({
      desenvolvedor_id: "30000000-0000-4000-8000-000000000001", nome: "Bruno", senioridade: "Senior",
      competencias: [{ tecnologia_id: PIX.id, tecnologia_nome: "PIX", nivel: "avancado", evidencia: "Entregou o checkout PIX." }],
      projetos: [{ projeto_id: PROJECT, projeto_nome: "Atlas", papeis: ["Backend"], em_andamento: true, tecnologias: [PIX], inicio: "2025-01-01T00:00:00Z", fim: null }],
    }),
  ]);
  const answer = await new TeamKnowledgeService(repository).whoWorkedWith("integração PIX", [PROJECT]);
  assert.equal(answer.encontrado, true);
  assert.deepEqual(repository.calls, [{ ids: [PIX.id], projects: [PROJECT] }]);
  assert.match(answer.resposta, /Bruno \(Senior\): competência avançado em PIX \(evidência: Entregou o checkout PIX\.\)/);
  assert.match(answer.resposta, /atuou em Atlas, como Backend, em andamento, projeto que usa PIX/);
  assert.deepEqual(answer.fontes.map((source) => [source.tipo, source.url]), [
    ["perfil_profissional", "/developers/30000000-0000-4000-8000-000000000001"],
    ["projeto", `/projects/${PROJECT}`],
  ]);
});

test("recusa sem sugerir profissionais quando não há registro", async () => {
  const none = await new TeamKnowledgeService(fakeTeamRepository([])).whoWorkedWith("PIX", [PROJECT]);
  assert.equal(none.encontrado, false);
  assert.match(none.resposta, /Não há registro de experiência com PIX na equipe/);
  assert.deepEqual(none.fontes, []);

  const repository = fakeTeamRepository([experience({ nome: "Não deveria aparecer" })]);
  const unknown = await new TeamKnowledgeService(repository).whoWorkedWith("Kotlin", [PROJECT]);
  assert.equal(unknown.encontrado, false);
  assert.match(unknown.resposta, /"Kotlin".*não consta no vocabulário/s);
  assert.equal(repository.calls.length, 0);
});

test("chat responde pela consulta de equipe sem acionar o RAG e marca a recusa como sem resultado", async () => {
  const finished: Array<{ resposta: string; origem: string; fontes: unknown[] }> = [];
  const repository = {
    async accessibleProjects() { return [{ id: PROJECT, nome: "Atlas" }]; },
    async projectExists() { return true; },
    async createConversation() { return { id: "50000000-0000-4000-8000-000000000001", projeto_id: PROJECT, escopo_tipo: "projeto", titulo: "t" }; },
    async addMessage() { return "60000000-0000-4000-8000-000000000001"; },
    async finishMessage(_c: string, _m: string, resposta: string, fontes: unknown[], origem: string) { finished.push({ resposta, origem, fontes }); },
    async failMessage() {},
    async listMessages() { return []; },
  } as unknown as ChatRepository;
  let ragCalls = 0;
  const assistant = { async ask() { ragCalls++; return { resposta: "rag", fontes: [] }; }, async askProjects() { ragCalls++; return { resposta: "rag", fontes: [] }; } };
  const team = new TeamKnowledgeService(fakeTeamRepository([]));
  const service = new ChatService(repository, assistant, team);

  const result = await service.query("10000000-0000-4000-8000-000000000001", { pergunta: "Quem já trabalhou com PIX?", projetoId: PROJECT, escopo: "projeto" });
  assert.equal(ragCalls, 0);
  assert.equal(result.origem, "sem_resultado");
  assert.match(result.resposta, /Não há registro/);
  assert.equal(finished[0]?.origem, "sem_resultado");

  await service.query("10000000-0000-4000-8000-000000000001", { pergunta: "Qual a decisão sobre PIX?", projetoId: PROJECT, escopo: "projeto" });
  assert.equal(ragCalls, 1);
});
