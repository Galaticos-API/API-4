import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ChatService } from './chat.service.js';
import { ChatRepository } from './chat.repository.js';
import { ragInput } from './rag.service.js';
import { NOT_FOUND_ANSWER, type AssistantAnswer } from './chat.types.js';
import type { Conversation } from './chat.types.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';

class RecordingChats extends ChatRepository {
  titles: string[] = [];
  renames: Array<{ conversation: string; user: string; title: string }> = [];
  questions: string[] = [];
  retries: Array<{ conversation: string; message: string; text: string }> = [];
  failedMessageIds: string[] = [];
  async projectExists() { return true; }
  async createConversation(user: string, project: string | null, title: string) {
    this.titles.push(title); return { id: randomUUID(), usuario_id: user, projeto_id: project, titulo: title, created_at: '2026-10-25T00:00:00Z', updated_at: '2026-10-25T00:00:00Z' };
  }
  async addMessage(_conversation: string, _sender: 'user' | 'assistant', text: string) { this.questions.push(text); return randomUUID(); }
  async retryMessage(conversation: string, message: string, text: string) { this.retries.push({ conversation, message, text }); return message; }
  async findOwnedConversation(conversation: string, user: string): Promise<Conversation | null> { return { id: conversation, usuario_id: user, projeto_id: randomUUID(), titulo: 'Retry', created_at: '2026-10-25T00:00:00Z', updated_at: '2026-10-25T00:00:00Z' }; }
  async renameConversation(conversation: string, user: string, title: string) {
    this.renames.push({ conversation, user, title });
    return { id: conversation, usuario_id: user, projeto_id: randomUUID(), titulo: title, created_at: '2026-10-25T00:00:00Z', updated_at: '2026-10-25T00:00:00Z' };
  }
  async finishMessage() { }
  async failMessage(messageId: string) { this.failedMessageIds.push(messageId); }
}
const assistant = { ask: async () => ({ resposta: NOT_FOUND_ANSWER, fontes: [] }) };

test('chat e RAG recusam caracteres incompatíveis com o banco antes de gravar', async () => {
  const chats = new RecordingChats(), service = new ChatService(chats, assistant);
  for (const invalid of ['\u0000', '\uD800', '\uDC00']) {
    const question = 'Consultar ' + invalid + ' evidências';
    assert.equal(ragInput.safeParse({ pergunta: question }).success, false);
    await assert.rejects(() => service.query(randomUUID(), { pergunta: question, projetoId: randomUUID() }), ValidationError);
  }
  assert.deepEqual(chats.titles, []);
});

test('abreviar um título não divide um emoji nem altera a pergunta', async () => {
  const chats = new RecordingChats(), service = new ChatService(chats, assistant);
  const question = 'a'.repeat(56) + '😀' + 'b'.repeat(10);
  await service.query(randomUUID(), { pergunta: question, projetoId: randomUUID() });
  assert.equal(/[\uD800-\uDFFF]/u.test(chats.titles[0]), false);
  assert.ok(chats.titles[0].includes('😀'));
  assert.deepEqual(chats.questions, [question]);
});
test('ChatService preserva a cobertura e classifica ausência/fora de escopo sem citar fontes', async () => {
  const cases = [
    { cobertura: 'no_evidence' as const, resposta: 'Informação não encontrada no acervo do projeto. O assistente responde somente com base nas evidências do acervo do projeto.' },
    { cobertura: 'out_of_scope' as const, resposta: 'Esse assunto está fora do escopo do acervo do projeto.' },
  ];
  for (const answer of cases) {
    const service = new ChatService(new RecordingChats(), { ask: async () => ({ ...answer, fontes: [], evidencias: [] }) });
    const result = await service.query(randomUUID(), { pergunta: 'Pergunta sem resposta', projetoId: randomUUID() });
    assert.equal(result.origem, 'sem_resultado');
    assert.equal(result.resposta, answer.resposta);
    assert.deepEqual(result.fontes, []);
    assert.deepEqual(result.evidencias, []);
  }
});

test('ChatService mantém resposta parcial como assistida e suas fontes verificadas', async () => {
  const evidence = { chunk_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', texto: 'O projeto integra WhatsApp para avisos.' };
  const source = { id: evidence.chunk_id, titulo: 'Decisão', tipo: 'decisao' };
  const answer = {
    cobertura: 'partial' as const,
    resposta: `${evidence.texto} [${evidence.chunk_id}]\n\nA resposta é parcial: o acervo não contém evidências suficientes para todos os aspectos da pergunta.`,
    fontes: [source],
    evidencias: [evidence],
  };
  const service = new ChatService(new RecordingChats(), { ask: async () => answer });
  const result = await service.query(randomUUID(), { pergunta: 'Pergunta com dois aspectos', projetoId: randomUUID() });

  assert.equal(result.origem, 'assistente');
  assert.equal(result.resposta, answer.resposta);
  assert.deepEqual(result.fontes, [source]);
  assert.deepEqual(result.evidencias, [evidence]);
});
test('ChatService propaga ao cliente somente os estágios de progresso definidos', async () => {
  const stages: string[] = [];
  const progressAssistant = {
    ask: async (_question: string, _project: string | undefined, _user: string | undefined, onProgress?: (stage: 'searching' | 'synthesizing' | 'validating') => void) => {
      onProgress?.('searching');
      onProgress?.('synthesizing');
      onProgress?.('validating');
      return { resposta: NOT_FOUND_ANSWER, fontes: [] };
    },
  };
  const service = new ChatService(new RecordingChats(), progressAssistant);
  await service.query(randomUUID(), { pergunta: 'Consultar acervo', projetoId: randomUUID() }, stage => stages.push(stage));
  assert.deepEqual(stages, ['searching', 'synthesizing', 'validating']);
});
test('ChatService marca a pergunta como recuperável quando a consulta é interrompida', async () => {
  const chats = new RecordingChats();
  const assistantWithAbort = {
    ask: async () => ({ resposta: NOT_FOUND_ANSWER, fontes: [] }),
    askProjects: async (_question: string, _projects: string[], _user: string, _progress?: (stage: 'searching' | 'synthesizing' | 'validating') => void, signal?: AbortSignal) =>
      new Promise<AssistantAnswer>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true })),
  };
  const service = new ChatService(chats, assistantWithAbort);
  const controller = new AbortController();
  const pending = service.query(randomUUID(), { pergunta: 'Consultar decisões', projetoId: randomUUID() }, undefined, controller.signal);
  controller.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof Error && 'code' in error && error.code === 'CHAT_CANCELLED');
  assert.equal(chats.failedMessageIds.length, 1);
  assert.deepEqual(chats.questions, ['Consultar decisões']);
});
test('título informado pelo usuário também preserva emojis e recusa texto inválido', async () => {
  const chats = new RecordingChats(), service = new ChatService(chats, assistant);
  await assert.rejects(() => service.createConversation(randomUUID(), { projetoId: randomUUID(), titulo: 'Título\u0000inválido' }), ValidationError);
  assert.equal(chats.titles.length, 0);
  await service.createConversation(randomUUID(), { projetoId: randomUUID(), titulo: 'x'.repeat(119) + '😀' + 'fim' });
  assert.equal(/[\uD800-\uDFFF]/u.test(chats.titles[0]), false); assert.ok(chats.titles[0].endsWith('😀'));
});

test('renomeação valida e normaliza o título sem dividir emojis', async () => {
  const chats = new RecordingChats(), service = new ChatService(chats, assistant);
  const conversationId = randomUUID();
  const renamed = await service.renameConversation('user-1', conversationId, '  Revisão 😀  ');
  assert.equal(renamed.titulo, 'Revisão 😀');
  assert.deepEqual(chats.renames, [{ conversation: conversationId, user: 'user-1', title: 'Revisão 😀' }]);
});

test('renomeação rejeita título ausente, vazio, inválido ou acima do limite', async () => {
  const chats = new RecordingChats(), service = new ChatService(chats, assistant);
  const conversationId = randomUUID();
  for (const invalid of [undefined, null, '', '   ', 'x'.repeat(121), 'Título\u0000inválido', 'Título\uD800inválido']) {
    await assert.rejects(() => service.renameConversation('user-1', conversationId, invalid), ValidationError);
  }
  assert.deepEqual(chats.renames, []);
});

test('renomeação só permite conversa própria e projeto ainda acessível', async () => {
  class RestrictedChats extends RecordingChats {
    accessible = true;
    existing = true;
    async projectExists() { return this.accessible; }
    async findOwnedConversation(conversation: string, user: string): Promise<Conversation | null> {
      if (!this.existing) return null;
      return { id: conversation, usuario_id: user, projeto_id: randomUUID(), titulo: 'Atual', created_at: '2026-10-25T00:00:00Z', updated_at: '2026-10-25T00:00:00Z' };
    }
  }
  const chats = new RestrictedChats(), service = new ChatService(chats, assistant), id = randomUUID();
  chats.existing = false;
  await assert.rejects(() => service.renameConversation('user-1', id, 'Novo título'), NotFoundError);
  chats.existing = true;
  chats.accessible = false;
  await assert.rejects(() => service.renameConversation('user-1', id, 'Novo título'), NotFoundError);
  assert.deepEqual(chats.renames, []);
});

test('exclusão de conversa valida UUID e lança NotFoundError se inexistente', async () => {
  class MockChats extends ChatRepository {
    deleted: string[] = [];
    async deleteConversation(id: string, userId: string) {
      if (id === '11111111-1111-4111-8111-111111111111' && userId === 'user-1') {
        this.deleted.push(id);
        return true;
      }
      return false;
    }
  }
  const mockRepo = new MockChats();
  const service = new ChatService(mockRepo, assistant);
  await assert.rejects(() => service.deleteConversation('user-1', 'invalido'), ValidationError);
  await assert.rejects(() => service.deleteConversation('user-1', '22222222-2222-4222-8222-222222222222'), NotFoundError);
  await service.deleteConversation('user-1', '11111111-1111-4111-8111-111111111111');
  assert.deepEqual(mockRepo.deleted, ['11111111-1111-4111-8111-111111111111']);
});

test('exclusão de mensagem valida conversa, projeto e identificadores', async () => {
  class MockChats extends RecordingChats {
    deleted: Array<{ conversation: string; message: string; user: string }> = [];
    async deleteMessage(conversation: string, message: string, user: string) {
      this.deleted.push({ conversation, message, user });
      return true;
    }
  }
  const chats = new MockChats();
  const service = new ChatService(chats, assistant);
  const conversation = '11111111-1111-4111-8111-111111111111';
  const message = '22222222-2222-4222-8222-222222222222';
  await service.deleteMessage('user-1', conversation, message);
  assert.deepEqual(chats.deleted, [{ conversation, message, user: 'user-1' }]);
  await assert.rejects(() => service.deleteMessage('user-1', 'invalid', message), ValidationError);
  await assert.rejects(() => service.deleteMessage('user-1', conversation, 'invalid'), ValidationError);
});

test('exclusão de mensagem inexistente ou em processamento retorna erro seguro', async () => {
  class MockChats extends RecordingChats {
    async deleteMessage(_conversation: string, message: string) {
      if (message === '22222222-2222-4222-8222-222222222222') throw new ConflictError('Mensagem pendente.');
      return false;
    }
  }
  const service = new ChatService(new MockChats(), assistant);
  const conversation = '11111111-1111-4111-8111-111111111111';
  await assert.rejects(() => service.deleteMessage('user-1', conversation, '33333333-3333-4333-8333-333333333333'), NotFoundError);
  await assert.rejects(() => service.deleteMessage('user-1', conversation, '22222222-2222-4222-8222-222222222222'), ConflictError);
});
