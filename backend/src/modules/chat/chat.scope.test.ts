import test from "node:test";
import assert from "node:assert/strict";
import { ANA, BRUNO, FakeAssistant, FakeChatRepository, PROJECT_A, PROJECT_B } from "./chat.fakes.js";
import { ChatService } from "./chat.service.js";

test("chat global: inicia em todos os projetos autorizados e mantém o escopo na conversa", async () => {
  const repository = new FakeChatRepository();
  const assistant = new FakeAssistant();
  const service = new ChatService(repository, assistant);

  const result = await service.query(ANA, { pergunta: "Compare as decisões registradas", escopo: "todos_autorizados" });

  assert.equal(repository.conversations[0].escopo_tipo, "todos_autorizados");
  assert.equal(repository.conversations[0].projeto_id, null);
  assert.deepEqual(assistant.projectCalls, [{ pergunta: "Compare as decisões registradas", projetoIds: [PROJECT_A, PROJECT_B] }]);
  assert.equal(result.escopo_tipo, "todos_autorizados");
});

test("chat restrito: consulta somente o projeto selecionado", async () => {
  const repository = new FakeChatRepository();
  const assistant = new FakeAssistant();
  const service = new ChatService(repository, assistant);

  const result = await service.query(ANA, { pergunta: "Qual stack?", escopo: "projeto", projetoId: PROJECT_B });

  assert.equal(repository.conversations[0].escopo_tipo, "projeto");
  assert.equal(repository.conversations[0].projeto_id, PROJECT_B);
  assert.deepEqual(assistant.projectCalls[0].projetoIds, [PROJECT_B]);
  assert.equal(result.escopo_tipo, "projeto");
  assert.notEqual(PROJECT_A, PROJECT_B);
});

test("chat global: falha sem projetos autorizados sem criar conversa nem chamar a IA", async () => {
  const repository = new FakeChatRepository();
  repository.allowedProjects = [];
  const assistant = new FakeAssistant();
  const service = new ChatService(repository, assistant);

  await assert.rejects(
    () => service.query(ANA, { pergunta: "Consultar decisões", escopo: "todos_autorizados" }),
    /Você não tem projetos disponíveis para consulta/,
  );
  assert.equal(repository.conversations.length, 0);
  assert.deepEqual(assistant.projectCalls, []);
});

test("chat global: ao retomar, restringe a busca à autorização atual", async () => {
  const repository = new FakeChatRepository();
  const assistant = new FakeAssistant();
  const service = new ChatService(repository, assistant);
  const conversation = await service.createConversation(ANA, { escopo: "todos_autorizados" });
  repository.allowedProjects = [{ id: PROJECT_A, nome: "A" }];

  const result = await service.query(ANA, { pergunta: "Continuar no meu escopo", conversaId: conversation.id });

  assert.deepEqual(assistant.projectCalls, [{ pergunta: "Continuar no meu escopo", projetoIds: [PROJECT_A] }]);
  assert.equal(result.escopo_tipo, "todos_autorizados");
});

test("PBI-04.2.1: conversas sao estritamente privadas por usuario (nao vazam para outros usuarios)", async () => {
  const repository = new FakeChatRepository();
  const assistant = new FakeAssistant();
  const service = new ChatService(repository, assistant);

  await service.createConversation(ANA, { titulo: "Conversa da Ana 1", escopo: "todos_autorizados" });
  await service.createConversation(ANA, { titulo: "Conversa da Ana 2", escopo: "todos_autorizados" });

  await service.createConversation(BRUNO, { titulo: "Conversa do Bruno", escopo: "todos_autorizados" });

  const anaConversations = await service.listConversations(ANA);
  assert.equal(anaConversations.length, 2);
  assert.ok(anaConversations.every((c) => c.usuario_id === ANA));
  assert.ok(!anaConversations.some((c) => c.titulo === "Conversa do Bruno"));

  const brunoConversations = await service.listConversations(BRUNO);
  assert.equal(brunoConversations.length, 1);
  assert.equal(brunoConversations[0].usuario_id, BRUNO);
  assert.equal(brunoConversations[0].titulo, "Conversa do Bruno");
});

test("PBI-04.2.1: ordena historico da mais recente para a mais antiga (updated_at DESC)", async () => {
  const repository = new FakeChatRepository();
  const assistant = new FakeAssistant();
  const service = new ChatService(repository, assistant);

  const c1 = await service.createConversation(ANA, { titulo: "Conversa Antiga", escopo: "todos_autorizados" });
  c1.updated_at = new Date("2026-10-01T10:00:00Z").toISOString();

  const c2 = await service.createConversation(ANA, { titulo: "Conversa Intermediaria", escopo: "todos_autorizados" });
  c2.updated_at = new Date("2026-10-15T10:00:00Z").toISOString();

  const c3 = await service.createConversation(ANA, { titulo: "Conversa Recente", escopo: "todos_autorizados" });
  c3.updated_at = new Date("2026-11-01T10:00:00Z").toISOString();

  const list = await service.listConversations(ANA);
  assert.equal(list.length, 3);
  assert.equal(list[0].titulo, "Conversa Recente");
  assert.equal(list[1].titulo, "Conversa Intermediaria");
  assert.equal(list[2].titulo, "Conversa Antiga");
});

test("PBI-04.2.1: gera titulo automaticamente a partir da primeira pergunta enviada", async () => {
  const repository = new FakeChatRepository();
  const assistant = new FakeAssistant();
  const service = new ChatService(repository, assistant);

  const pergunta = "Como funciona a autenticacao multifator?";
  const result = await service.query(ANA, { pergunta, escopo: "todos_autorizados" });

  const conversation = await repository.findOwnedConversation(result.conversa_id, ANA);
  assert.ok(conversation);
  assert.equal(conversation.titulo, pergunta);
  assert.equal(conversation.escopo_tipo, "todos_autorizados");
});
