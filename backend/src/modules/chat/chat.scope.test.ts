import test from "node:test";
import assert from "node:assert/strict";
import { ANA, FakeAssistant, FakeChatRepository, PROJECT_A, PROJECT_B } from "./chat.fakes.js";
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
