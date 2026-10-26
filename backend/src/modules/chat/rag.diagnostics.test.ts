import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../shared/errors.js';
import { ChatRepository } from './chat.repository.js';
import { RagService } from './rag.service.js';
import { ChatService } from './chat.service.js';
import { SearchRepository } from '../search/search.repository.js';
import { HarnessRepository } from '../harness/harness.repository.js';
import { HarnessService } from '../harness/harness.service.js';
import { defaultConfig, type HarnessMode } from '../harness/harness.contract.js';

const projectId = randomUUID();
const userId = randomUUID();

function captureErrors() {
  const original = console.error;
  const entries: unknown[][] = [];
  console.error = (...args: unknown[]) => { entries.push(args); };
  return {
    entries,
    restore: () => { console.error = original; },
  };
}

test('RAG logs sanitized failure stage and diagnostic ID without exception content', async () => {
  class Chats extends ChatRepository {
    async accessibleProjects() { return [{ id: projectId, nome: 'QA' }]; }
  }
  const capture = captureErrors();
  let publicError: unknown;
  try {
    const service = new RagService(new Chats(), undefined, {
      embed: async () => { throw new Error('private question and secret token'); },
    });
    try { await service.answer(userId, 'Pergunta privada', [projectId]); }
    catch (error) { publicError = error; }
  } finally {
    capture.restore();
  }

  assert.ok(publicError instanceof AppError);
  assert.equal(publicError.code, 'RAG_UNAVAILABLE');
  assert.equal(publicError.statusCode, 503);
  assert.equal(publicError.message, 'O assistente está indisponível ou não conseguiu validar as evidências. Sua pergunta foi preservada.');
  assert.equal(capture.entries.length, 1);
  const [label, event] = capture.entries[0] as [string, Record<string, unknown>];
  assert.equal(label, '[RAG] Request failed');
  assert.equal(event.etapa, 'embedding');
  assert.equal(event.codigo, 'RAG_EMBEDDING_FAILED');
  assert.match(String(event.diagnostico_id), /^[0-9a-f-]{36}$/i);
  assert.deepEqual(publicError.details, { diagnostico_id: event.diagnostico_id });
  assert.equal(typeof event.duracao_ms, 'number');
  assert.doesNotMatch(JSON.stringify(capture.entries), /private question|secret token/);
});

test('RAG identifica falhas no hybrid search sem registrar o erro do PostgreSQL', async () => {
  class Chats extends ChatRepository {
    async accessibleProjects() { return [{ id: projectId, nome: 'QA' }]; }
  }
  class Search extends SearchRepository {
    async hybridSearch(): Promise<never> { throw new Error('private SQL with user content'); }
  }
  const capture = captureErrors();
  try {
    const service = new RagService(new Chats(), new Search(), {
      embed: async () => Array(1024).fill(0.1),
    });
    await assert.rejects(() => service.answer(userId, 'Pergunta privada', [projectId]),
      (error: unknown) => error instanceof AppError && error.code === 'RAG_UNAVAILABLE');
  } finally {
    capture.restore();
  }
  assert.equal(capture.entries.length, 1);
  const [label, event] = capture.entries[0] as [string, Record<string, unknown>];
  assert.equal(label, '[RAG] Request failed');
  assert.equal(event.etapa, 'hybrid_search');
  assert.equal(event.codigo, 'RAG_RETRIEVAL_FAILED');
  assert.doesNotMatch(JSON.stringify(capture.entries), /private SQL|user content/);
});

test('Harness logs sanitized failure stage and returns only the diagnostic ID in details', async () => {
  class Revisions extends HarnessRepository {
    async current(mode: HarnessMode) {
      return { mode, version: 1, schema_version: 1 as const, config: defaultConfig(mode), created_at: null, created_by: null };
    }
  }
  const diagnosticId = randomUUID();
  const capture = captureErrors();
  let caught: unknown;
  try {
    const service = new HarnessService(new Revisions(), {
      generate: async () => { throw new Error('private prompt and model response'); },
    });
    try {
      await service.run(projectId, {
        mode: 'consulta', operation: 'responder', level: 'pbi', fields: { pergunta: 'Pergunta privada' }, context: [],
      }, [], diagnosticId);
    } catch (error) {
      caught = error;
    }
  } finally {
    capture.restore();
  }

  assert.ok(caught instanceof AppError);
  assert.equal(caught.code, 'AI_HARNESS_UNAVAILABLE');
  assert.deepEqual(caught.details, { diagnostico_id: diagnosticId, etapa: 'generation' });
  assert.equal(capture.entries.length, 1);
  const [label, event] = capture.entries[0] as [string, Record<string, unknown>];
  assert.equal(label, '[AI Harness] Request failed');
  assert.equal(event.diagnostico_id, diagnosticId);
  assert.equal(event.etapa, 'generation');
  assert.equal(event.codigo, 'AI_HARNESS_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(capture.entries), /private prompt|model response/);
});

test('ChatService preserves only a validated diagnostic ID when wrapping the RAG error', async () => {
  class Chats extends ChatRepository {
    async projectExists() { return true; }
    async createConversation(usuarioId: string, projetoId: string, titulo: string) {
      return { id: randomUUID(), usuario_id: usuarioId, projeto_id: projetoId, titulo, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    }
    async addMessage() { return randomUUID(); }
    async failMessage() {}
  }
  const diagnosticId = randomUUID();
  const service = new ChatService(new Chats(), {
    ask: async () => { throw new AppError('Safe RAG error', 503, 'RAG_UNAVAILABLE', { diagnostico_id: diagnosticId, prompt: 'must not be copied' }); },
  });
  await assert.rejects(() => service.query(userId, { pergunta: 'Pergunta privada', projetoId: projectId }), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'CHAT_FAILED');
    assert.ok(typeof error.details === 'object' && error.details !== null);
    const details = error.details as Record<string, unknown>;
    assert.equal(typeof details.conversa_id, 'string');
    assert.equal(typeof details.mensagem_id, 'string');
    assert.deepEqual({ diagnostico_id: details.diagnostico_id }, { diagnostico_id: diagnosticId });
    assert.equal('prompt' in details, false);
    return true;
  });
});
