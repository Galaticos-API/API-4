import test from "node:test";
import assert from "node:assert/strict";
import { NotFoundError, ValidationError } from "../../shared/errors.js";
import { ChatService, searchPatterns, sanitizeSources } from "./chat.service.js";
import { ANA, BRUNO, FakeAssistant, FakeChatRepository, PROJECT_A, PROJECT_B } from "./chat.fakes.js";

function setup() {
  const repository = new FakeChatRepository();
  const assistant = new FakeAssistant();
  return { repository, assistant, service: new ChatService(repository, assistant) };
}

test("nova pergunta cria a conversa, registra as duas mensagens e devolve as fontes do assistente", async () => {
  const { service, repository, assistant } = setup();
  const result = await service.query(ANA, { pergunta: "  Quais decisões definem o login?  ", projetoId: PROJECT_A });

  assert.equal(result.origem, "assistente");
  assert.equal(result.resposta, "Resposta do assistente");
  assert.deepEqual(result.fontes, [{ id: "s1", titulo: "Decisão 1", tipo: "decisao" }]);
  assert.deepEqual(assistant.calls, [{ pergunta: "Quais decisões definem o login?", projetoId: PROJECT_A }]);
  assert.equal(repository.conversations[0].projeto_id, PROJECT_A);
  assert.equal(repository.conversations[0].titulo, "Quais decisões definem o login?");
  assert.deepEqual(repository.messages.map((item) => item.remetente), ["user", "assistant"]);
});

test("valida pergunta vazia, longa demais, projeto inválido e inexistente", async () => {
  const { service } = setup();
  await assert.rejects(service.query(ANA, { pergunta: "   " }), ValidationError);
  await assert.rejects(service.query(ANA, { pergunta: "a".repeat(2001) }), /no máximo 2000/);
  await assert.rejects(service.query(ANA, { pergunta: "ok", projetoId: "nao-uuid" }), ValidationError);
  await assert.rejects(service.query(ANA, { pergunta: "ok", projetoId: "a0000000-0000-4000-8000-0000000000ff" }), NotFoundError);
});

test("não permite usar nem ler a conversa de outro usuário e não revela que ela existe", async () => {
  const { service, repository } = setup();
  const conversa = await repository.createConversation(ANA, PROJECT_A, "Privada");
  await repository.addMessage(conversa.id, "user", "segredo de Ana");

  await assert.rejects(service.listMessages(BRUNO, conversa.id), NotFoundError);
  await assert.rejects(service.query(BRUNO, { pergunta: "injeção", conversaId: conversa.id }), NotFoundError);
  await assert.rejects(service.listMessages(BRUNO, "invalido"), ValidationError);
  assert.equal(repository.messages.length, 1);
  assert.equal((await service.listMessages(ANA, conversa.id)).length, 1);
});

test("conversa existente herda o projeto quando a pergunta não informa outro", async () => {
  const { service, repository, assistant } = setup();
  const conversa = await repository.createConversation(ANA, PROJECT_B, "Projeto B");
  await service.query(ANA, { pergunta: "Como funciona o arquivamento?", conversaId: conversa.id });
  assert.equal(assistant.calls[0].projetoId, PROJECT_B);
});

test("com o assistente indisponível usa busca textual restrita ao projeto e informa a origem", async () => {
  const { service, repository, assistant } = setup();
  assistant.available = false;
  repository.chunks.push(
    { id: "k1", projeto_id: PROJECT_A, entidade_tipo: "documento", entidade_id: "d1", texto: "O arquivamento preserva o histórico." },
    { id: "k2", projeto_id: PROJECT_B, entidade_tipo: "documento", entidade_id: "d2", texto: "Arquivamento de outro projeto confidencial." },
  );

  const result = await service.query(ANA, { pergunta: "Como funciona o arquivamento?", projetoId: PROJECT_A });
  assert.equal(result.origem, "busca_textual");
  assert.match(result.resposta, /O assistente está indisponível/);
  assert.match(result.resposta, /preserva o histórico/);
  assert.ok(!result.resposta.includes("confidencial"));
  assert.deepEqual(result.fontes.map((source) => source.id), ["k1"]);
  assert.equal(repository.searches[0].projetoId, PROJECT_A);
});

test("sem termos úteis ou sem correspondência não inventa evidência", async () => {
  const { service, repository, assistant } = setup();
  assistant.available = false;
  repository.chunks.push({ id: "k1", projeto_id: PROJECT_A, entidade_tipo: "documento", entidade_id: "d1", texto: "Texto qualquer sobre backlog." });

  const noTerms = await service.query(ANA, { pergunta: "e o q?", projetoId: PROJECT_A });
  assert.equal(noTerms.origem, "sem_resultado");
  assert.equal(noTerms.resposta, "Informação não encontrada no acervo do projeto.");
  assert.deepEqual(noTerms.fontes, []);

  const noMatch = await service.query(ANA, { pergunta: "Quem escolheu a tecnologia de mensageria?", projetoId: PROJECT_A });
  assert.equal(noMatch.origem, "sem_resultado");
});

test("padrões de busca usam só termos com 4+ caracteres, sem curingas do usuário, e limitam a quantidade", () => {
  assert.deepEqual(searchPatterns("Qual é o 100%_teste?"), ["%qual%", "%teste%"]);
  assert.deepEqual(searchPatterns("a b c"), []);
  assert.deepEqual(searchPatterns("Promoção promoção PROMOÇÃO"), ["%promoção%"]);
  assert.equal(searchPatterns("alfa beta gama delta epsilon zeta eta theta iota").length, 6);
  assert.ok(searchPatterns("descontos_totais 50%").every((pattern) => /^%[\p{L}\p{N}]+%$/u.test(pattern)));
});

test("fontes do assistente são saneadas e limitadas", () => {
  assert.deepEqual(sanitizeSources("x"), []);
  assert.deepEqual(sanitizeSources([null, { titulo: "sem id" }, { id: "1" }, { id: "2", titulo: "T", tipo: "pbi" }]), [
    { id: "1", titulo: "1", tipo: "documento" },
    { id: "2", titulo: "T", tipo: "pbi" },
  ]);
});

test("cria conversa com título padrão e valida o projeto", async () => {
  const { service } = setup();
  assert.equal((await service.createConversation(ANA, {})).titulo, "Nova conversa");
  assert.equal((await service.createConversation(ANA, { titulo: "  Reunião  ", projetoId: PROJECT_A })).titulo, "Reunião");
  await assert.rejects(service.createConversation(ANA, { projetoId: "x" }), ValidationError);
  assert.equal((await service.listConversations(BRUNO)).length, 0);
});
