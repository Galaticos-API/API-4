import test from "node:test";
import assert from "node:assert/strict";
import { ANA, BRUNO, FakeAssistant, FakeChatRepository, PROJECT_A, PROJECT_B } from "./chat.fakes.js";
import { ChatService } from "./chat.service.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";

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

test("PBI-04.2.2 Cenário 1: reabrir conversa apresenta todas as mensagens com as fontes preservadas", async () => {
  const repository = new FakeChatRepository();
  const assistant = new FakeAssistant();
  assistant.answer = {
    resposta: "O login usa OAuth 2.0 e JWT. [s1]",
    fontes: [{
      id: "s1",
      titulo: "Arquitetura de Autenticação",
      tipo: "documento",
      projeto_id: PROJECT_A,
      projeto_nome: "Projeto Alpha",
      chunk_ids: ["a0000000-0000-4000-8000-000000000099"],
      evidencias: [{ chunk_id: "a0000000-0000-4000-8000-000000000099", texto: "Autenticação via OAuth 2.0" }],
    }],
  };
  const service = new ChatService(repository, assistant);

  const result = await service.query(ANA, {
    pergunta: "Como funciona o login do Projeto A?",
    escopo: "projeto",
    projetoId: PROJECT_A,
  });

  const messages = await service.listMessages(ANA, result.conversa_id);

  assert.equal(messages.length, 2);
  assert.equal(messages[0].remetente, "user");
  assert.equal(messages[0].conteudo, "Como funciona o login do Projeto A?");
  assert.equal(messages[1].remetente, "assistant");
  assert.equal(messages[1].conteudo, "O login usa OAuth 2.0 e JWT. [s1]");
  assert.equal(messages[1].fontes_json.length, 1);
  assert.equal(messages[1].fontes_json[0].id, "s1");
  assert.equal(messages[1].fontes_json[0].titulo, "Arquitetura de Autenticação");
  assert.equal(messages[1].fontes_json[0].tipo, "documento");
  assert.equal(messages[1].fontes_json[0].projeto_id, PROJECT_A);
  assert.equal(messages[1].fontes_json[0].projeto_nome, "Projeto Alpha");
  assert.deepEqual(messages[1].fontes_json[0].evidencias, [
    { chunk_id: "a0000000-0000-4000-8000-000000000099", texto: "Autenticação via OAuth 2.0" },
  ]);
});

test("PBI-04.2.2 Cenário 1: mensagens são privadas ao usuário e não podem ser reabertas por outro", async () => {
  const repository = new FakeChatRepository();
  const assistant = new FakeAssistant();
  const service = new ChatService(repository, assistant);

  const result = await service.query(ANA, {
    pergunta: "Pergunta confidencial da Ana",
    escopo: "projeto",
    projetoId: PROJECT_A,
  });

  await assert.rejects(
    () => service.listMessages(BRUNO, result.conversa_id),
    NotFoundError,
  );
  await assert.rejects(
    () => service.getConversation(BRUNO, result.conversa_id),
    NotFoundError,
  );
});

test("PBI-04.2.2 Cenário 2: retomar conversa preserva o escopo restrito ao projeto na consulta seguinte", async () => {
  const repository = new FakeChatRepository();
  const assistant = new FakeAssistant();
  const service = new ChatService(repository, assistant);

  const firstResult = await service.query(ANA, {
    pergunta: "Qual a arquitetura do Projeto B?",
    escopo: "projeto",
    projetoId: PROJECT_B,
  });
  assert.equal(firstResult.escopo_tipo, "projeto");

  const secondResult = await service.query(ANA, {
    pergunta: "E qual o banco de dados utilizado?",
    conversaId: firstResult.conversa_id,
  });

  assert.equal(secondResult.escopo_tipo, "projeto");
  assert.equal(assistant.projectCalls.length, 2);
  assert.deepEqual(assistant.projectCalls[1].projetoIds, [PROJECT_B]);
  assert.equal(assistant.projectCalls[1].pergunta, "E qual o banco de dados utilizado?");
  assert.ok(assistant.projectCalls[1].history && assistant.projectCalls[1].history.length > 0);
});

test("PBI-04.2.2 Cenário 2: rejeita alteração do escopo ao retomar conversa existente", async () => {
  const repository = new FakeChatRepository();
  const assistant = new FakeAssistant();
  const service = new ChatService(repository, assistant);

  const conversation = await service.createConversation(ANA, {
    escopo: "projeto",
    projetoId: PROJECT_A,
    titulo: "Conversa no Projeto A",
  });

  await assert.rejects(
    () => service.query(ANA, {
      pergunta: "Tentar mudar de escopo",
      conversaId: conversation.id,
      escopo: "todos_autorizados",
    }),
    /O escopo da conversa não pode ser alterado/,
  );

  await assert.rejects(
    () => service.query(ANA, {
      pergunta: "Tentar mudar de projeto",
      conversaId: conversation.id,
      projetoId: PROJECT_B,
    }),
    /O projeto da conversa não pode ser alterado/,
  );
});

test("PBI-04.2.2: getConversation consulta conversa pelo ID e preserva escopo e projeto", async () => {
  const repository = new FakeChatRepository();
  const assistant = new FakeAssistant();
  const service = new ChatService(repository, assistant);

  const convA = await service.createConversation(ANA, {
    escopo: "projeto",
    projetoId: PROJECT_A,
    titulo: "Conversa Projeto A",
  });

  const convGlobal = await service.createConversation(ANA, {
    escopo: "todos_autorizados",
    titulo: "Conversa Global",
  });

  const fetchedA = await service.getConversation(ANA, convA.id);
  assert.equal(fetchedA.id, convA.id);
  assert.equal(fetchedA.escopo_tipo, "projeto");
  assert.equal(fetchedA.projeto_id, PROJECT_A);

  const fetchedGlobal = await service.getConversation(ANA, convGlobal.id);
  assert.equal(fetchedGlobal.id, convGlobal.id);
  assert.equal(fetchedGlobal.escopo_tipo, "todos_autorizados");
  assert.equal(fetchedGlobal.projeto_id, null);

  repository.allowedProjects = [{ id: PROJECT_B, nome: "B" }];
  const fetchedLostAccess = await service.getConversation(ANA, convA.id);
  assert.equal(fetchedLostAccess.escopo_tipo, "indisponivel");
});

test("legado sem escopo explícito usa o mesmo fallback na listagem e no GET, preservando autorização", async () => {
  const repository = new FakeChatRepository();
  const service = new ChatService(repository, new FakeAssistant());
  const legacy = {
    id: "c0000000-0000-4000-8000-000000000077",
    usuario_id: ANA,
    projeto_id: PROJECT_A,
    projeto_nome: "A",
    titulo: "Conversa legada",
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
  };
  repository.conversations.push(legacy);

  const listed = await service.listConversations(ANA);
  const fetched = await service.getConversation(ANA, legacy.id);
  assert.equal(listed[0].escopo_tipo, "projeto");
  assert.equal(fetched.escopo_tipo, listed[0].escopo_tipo);
  assert.equal(listed[0].projeto_id, PROJECT_A);
  assert.equal(fetched.projeto_id, listed[0].projeto_id);

  repository.allowedProjects = [{ id: PROJECT_B, nome: "B" }];
  const revokedListed = await service.listConversations(ANA);
  const revokedFetched = await service.getConversation(ANA, legacy.id);
  assert.equal(revokedListed[0].escopo_tipo, "indisponivel");
  assert.equal(revokedFetched.escopo_tipo, "indisponivel");
  assert.equal(revokedListed[0].projeto_id, null);
  assert.equal(revokedFetched.projeto_id, null);
});
