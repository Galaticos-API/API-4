import test from "node:test";
import assert from "node:assert/strict";
import { ChatService, recentConversationContext } from "./chat.service.js";
import { ANA, FakeChatRepository, PROJECT_A, PROJECT_B } from "./chat.fakes.js";
import type { AssistantAnswer, ChatMessage } from "./chat.types.js";

const message = (id: string, conversation: string, sender: ChatMessage["remetente"], content: string, status: ChatMessage["processing_status"] = "completed"): ChatMessage => ({
  id, conversa_id: conversation, remetente: sender, conteudo: content, fontes_json: [], processing_status: status, created_at: "2026-10-28T12:00:00.000Z",
});

test("contexto inclui somente turnos concluídos anteriores e exclui a pergunta atual", () => {
  const history = [
    message("u1", "c1", "user", "Qual banco usamos?"),
    message("a1", "c1", "assistant", "O projeto usa PostgreSQL."),
    message("u2", "c1", "user", "Pergunta pendente", "pending"),
    message("u3", "c1", "user", "Pergunta que falhou", "failed"),
    message("current", "c1", "user", "E por que escolheram esse banco?", "pending"),
    message("system", "c1", "system", "Instrução do sistema"),
  ];
  assert.deepEqual(recentConversationContext(history, "current"), [
    { role: "user", content: "Qual banco usamos?" },
    { role: "assistant", content: "O projeto usa PostgreSQL." },
  ]);
});

test("contexto de conversa é limitado em quantidade e tamanho", () => {
  const countLimited = recentConversationContext(
    Array.from({ length: 12 }, (_, index) => message(`short-${index}`, "c1", index % 2 ? "assistant" : "user", `${index}:${"x".repeat(100)}`)),
    "current",
  );
  assert.equal(countLimited.length, 8);

  const sizeLimited = recentConversationContext(
    Array.from({ length: 6 }, (_, index) => message(`long-${index}`, "c1", index % 2 ? "assistant" : "user", `${index}:${"x".repeat(1_199)}`)),
    "current",
  );
  assert.equal(sizeLimited.length, 4);
  assert.equal(sizeLimited.reduce((total, turn) => total + turn.content.length, 0), 4_000);
  assert.ok(sizeLimited.every(turn => turn.content.length <= 1_000));
});

test("pergunta de acompanhamento recebe histórico da conversa, sem alterar a pergunta original", async () => {
  const repository = new FakeChatRepository();
  const conversation = await repository.createConversation(ANA, PROJECT_A, "Banco de dados", "projeto");
  repository.messages.push(
    message("user-1", conversation.id, "user", "Qual banco de dados o projeto usa?"),
    message("assistant-1", conversation.id, "assistant", "O projeto usa PostgreSQL."),
  );
  let received: { question: string; projects: string[]; history: unknown[] } | undefined;
  const answer: AssistantAnswer = { resposta: "O registro não informa o motivo. [source]", fontes: [] };
  const assistant = {
    ask: async () => answer,
    askProjects: async (question: string, projects: string[], _user: string, _progress?: unknown, _signal?: AbortSignal, history: unknown[] = []) => {
      received = { question, projects, history };
      return answer;
    },
  };
  await new ChatService(repository, assistant).query(ANA, { pergunta: "E por que escolheram esse banco?", conversaId: conversation.id });
  assert.deepEqual(received, {
    question: "E por que escolheram esse banco?",
    projects: [PROJECT_A],
    history: [
      { role: "user", content: "Qual banco de dados o projeto usa?" },
      { role: "assistant", content: "O projeto usa PostgreSQL." },
    ],
  });
});

test("primeira pergunta não recebe contexto de conversas anteriores", async () => {
  const repository = new FakeChatRepository();
  const old = await repository.createConversation(ANA, PROJECT_B, "Outra conversa", "projeto");
  repository.messages.push(message("old-user", old.id, "user", "Não deve ser incluído"));
  let receivedHistory: unknown;
  const assistant = {
    ask: async () => ({ resposta: "Resposta", fontes: [] }),
    askProjects: async (_question: string, _projects: string[], _user: string, _progress?: unknown, _signal?: AbortSignal, history: unknown[] = []) => {
      receivedHistory = history;
      return { resposta: "Resposta", fontes: [] };
    },
  };
  await new ChatService(repository, assistant).query(ANA, { pergunta: "Nova pergunta", escopo: "projeto", projetoId: PROJECT_A });
  assert.deepEqual(receivedHistory, []);
});

test("histórico não atravessa conversas e o escopo segue as autorizações atuais", async () => {
  const repository = new FakeChatRepository();
  const conversation = await repository.createConversation(ANA, null, "Global", "todos_autorizados");
  const other = await repository.createConversation(ANA, PROJECT_B, "Projeto B", "projeto");
  repository.messages.push(
    message("global-user", conversation.id, "user", "Decisões gerais anteriores"),
    message("other-user", other.id, "user", "Conteúdo privado da outra conversa"),
  );
  repository.allowedProjects = [{ id: PROJECT_A, nome: "A" }];
  let received: { projects: string[]; history: unknown[] } | undefined;
  const assistant = {
    ask: async () => ({ resposta: "Resposta", fontes: [] }),
    askProjects: async (_question: string, projects: string[], _user: string, _progress?: unknown, _signal?: AbortSignal, history: unknown[] = []) => {
      received = { projects, history };
      return { resposta: "Resposta", fontes: [] };
    },
  };
  await new ChatService(repository, assistant).query(ANA, { pergunta: "E sobre isso?", conversaId: conversation.id });
  assert.deepEqual(received, {
    projects: [PROJECT_A],
    history: [{ role: "user", content: "Decisões gerais anteriores" }],
  });
});
