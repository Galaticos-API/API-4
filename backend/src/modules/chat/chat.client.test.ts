import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { HttpAssistantClient } from './chat.service.js';
import { ChatRepository } from './chat.repository.js';

test('HttpAssistantClient devolve exatamente a resposta RAG verificada sem nova geração livre', async () => {
  const projectId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const response = {
    contrato: 'rag-conversacional-v1',
    resposta: 'O projeto integra WhatsApp para avisos. [aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]\n\nA resposta é parcial: o acervo não contém evidências suficientes para todos os aspectos da pergunta.',
    fontes: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', titulo: 'Decisão', tipo: 'decisao' }],
    evidencias: [{ chunk_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', texto: 'O projeto integra WhatsApp para avisos.' }],
    escopo: [projectId],
    cobertura: 'partial' as const,
  };
  const calls: unknown[][] = [];
  const answerer = {
    async answer(...args: unknown[]) {
      calls.push(args);
      return response;
    },
  };
  const originalFetch = globalThis.fetch;
  let unverifiedGenerationCalls = 0;
  globalThis.fetch = async () => {
    unverifiedGenerationCalls += 1;
    throw new Error('Uma segunda geração livre não deve ser chamada.');
  };

  try {
    const client = new HttpAssistantClient('http://ai.test', new ChatRepository(), answerer);
    const result = await client.ask('Para que usa WhatsApp e qual o prazo?', projectId, userId);

    assert.deepEqual(result, response);
    assert.deepEqual(calls, [[userId, 'Para que usa WhatsApp e qual o prazo?', [projectId], undefined, undefined, []]]);
    assert.equal(unverifiedGenerationCalls, 0);
    assert.ok(result.resposta.includes('[aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa]'));
    assert.ok(result.resposta.includes('A resposta é parcial:'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('HttpAssistantClient exige projeto e autenticação antes de consultar o RAG', async () => {
  let calls = 0;
  const answerer = { async answer(): Promise<never> { calls += 1; throw new Error('O RAG não deveria ser consultado.'); } };
  const client = new HttpAssistantClient('http://ai.test', new ChatRepository(), answerer);

  await assert.rejects(() => client.ask('Pergunta'), /Escolha um projeto/);
  await assert.rejects(() => client.ask('Pergunta', '11111111-1111-4111-8111-111111111111'), /Autenticação necessária/);
  assert.equal(calls, 0);
});

test('OpenAPI documenta os quatro estados de cobertura retornados pelo RAG', () => {
  const spec = YAML.parse(readFileSync(resolve(process.cwd(), '../docs/api/openapi.yaml'), 'utf8'));
  const response = spec.paths['/api/v1/chat/answer'].post.responses['200'].content['application/json'].schema;

  assert.ok(response.required.includes('cobertura'));
  assert.deepEqual(response.properties.cobertura.enum, ['complete', 'partial', 'no_evidence', 'out_of_scope']);
});
