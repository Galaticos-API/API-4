import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RagService } from './rag.service.js';
import { ChatRepository } from './chat.repository.js';
import { SearchRepository } from '../search/search.repository.js';
import { HarnessRepository } from '../harness/harness.repository.js';
import { defaultConfig } from '../harness/harness.contract.js';
import { NOT_FOUND_ANSWER } from './chat.types.js';
import type { HybridSearchRow } from '../search/search.types.js';

interface RagSmokeFixture {
  fictional_only: true;
  project: { id: string; name: string };
  document: { id: string; title: string };
  chunks: Array<{ id: string; text: string }>;
  queries: Array<{
    id: string;
    kind: 'positive' | 'positive_with_paraphrase' | 'negative';
    variants: string[];
    expected_chunk_id: string | null;
    expected_quote: string | null;
  }>;
}

// Fatos inventados para QA. A fixture não é corpus de produção nem benchmark de relevância.
const fixture = JSON.parse(readFileSync(resolve(process.cwd(), '../ai-service/evaluation/datasets/chat-rag-smoke-v1.json'), 'utf8')) as RagSmokeFixture;
assert.equal(fixture.fictional_only, true);
const fixtureRows: HybridSearchRow[] = fixture.chunks.map((chunk) => ({
  id: chunk.id,
  entity_id: fixture.document.id,
  entity_type: 'documento',
  project_id: fixture.project.id,
  project_name: fixture.project.name,
  title: fixture.document.title,
  text: chunk.text,
  metadata: { fictional_only: true, dataset: 'sinapse-chat-rag-qa-smoke', version: 1 },
  source_url: `/projects/${fixture.project.id}/documents/${fixture.document.id}`,
  relevance_score: 1,
}));

class FixtureChats extends ChatRepository {
  constructor(private readonly allowedProject = fixture.project.id) { super(); }
  async accessibleProjects() {
    return this.allowedProject === fixture.project.id
      ? [{ id: fixture.project.id, nome: fixture.project.name }]
      : [];
  }
  async currentRagChunks(_userId: string, ids: string[]) {
    return fixtureRows.filter((row) => ids.includes(row.id)).map((row) => ({
      id: row.id,
      texto: row.text,
      projeto_id: row.project_id,
      entidade_tipo: row.entity_type,
      entidade_id: row.entity_id,
      metadados_json: row.metadata,
    }));
  }
}

class FixtureSearch extends SearchRepository {
  constructor(private readonly rows: HybridSearchRow[]) { super(); }
  async hybridSearch(input: { query: string; projectId: string; limit: number }, _embedding: number[], _minimumSimilarity: number, _minimumTextRank: number, projectIds: string[]) {
    assert.equal(input.projectId, fixture.project.id);
    assert.deepEqual(projectIds, [fixture.project.id]);
    assert.equal(input.limit, 5);
    return this.rows;
  }
}

class FixtureRevisions extends HarnessRepository {
  async current() {
    return { mode: 'consulta' as const, version: 0, schema_version: 1 as const, config: defaultConfig('consulta'), created_at: null, created_by: null };
  }
}

function makeService(rows: HybridSearchRow[], generate: (payload: Record<string, unknown>) => Promise<unknown>, onEmbed?: (query: string) => void) {
  return new RagService(new FixtureChats(), new FixtureSearch(rows), {
    embed: async (query: string) => { onEmbed?.(query); return Array(1024).fill(0.1); },
  }, new FixtureRevisions(), { generate: async (payload) => {
    const schema=payload.output_schema as {properties?:Record<string,unknown>};
    if(schema.properties?.evidence) return generate(payload);
    const context=payload.context as Array<{id:string;text:string}>;
    const id=context[0]?.id;
    return {answer:`Encontrei esta informação no acervo. [${id}]`,sources:id?[id]:[]};
  }});
}

test('chat RAG QA fictício: fatos positivos e paráfrases devolvem citação da fonte esperada', async () => {
  const cases = fixture.queries.filter((query) => query.expected_chunk_id !== null);
  let testedVariants = 0;

  for (const query of cases) {
    const expectedRow = fixtureRows.find((row) => row.id === query.expected_chunk_id)!;
    for (const variant of query.variants) {
      const embeddedQuestions: string[] = [];
      let generationCalls = 0;
      const service = makeService([expectedRow], async (payload) => {
        generationCalls += 1;
        const context = payload.context as Array<{ id: string; text: string }>;
        assert.ok(context.some((item) => item.id === expectedRow.id));
        return { coverage: 'complete', evidence: [{ source_id: expectedRow.id, quote: query.expected_quote }] };
      }, (question) => { embeddedQuestions.push(question); });

      const response = await service.answer(randomUUID(), variant, [fixture.project.id]);
      assert.ok(embeddedQuestions.includes(variant), `${query.id}: preserva a pergunta original junto à consulta interpretada`);
      assert.equal(generationCalls, 1, `${query.id}: gera resposta com evidência`);
      assert.deepEqual(response.evidencias, [{ chunk_id: expectedRow.id, texto: query.expected_quote }]);
      assert.ok(response.resposta.includes(`[${expectedRow.id}]`), `${query.id}: cita o chunk literal recuperado`);
      assert.equal(response.fontes.length, 1);
      assert.equal(response.fontes[0].projeto_id, fixture.project.id);
      assert.ok(response.fontes[0].chunk_ids?.includes(expectedRow.id));
      assert.deepEqual(new Set(response.fontes.flatMap((source) => source.chunk_ids ?? [])), new Set(response.evidencias.map((evidence) => evidence.chunk_id)));
      testedVariants += 1;
    }
  }

  assert.equal(cases.length, 5);
  assert.equal(testedVariants, 7);
});

test('chat RAG QA fictício: pergunta sem evidência se abstém e não chama o gerador', async () => {
  const query = fixture.queries.find((item) => item.kind === 'negative')!;
  let generationCalls = 0;
  const service = makeService([], async () => { generationCalls += 1; return { coverage: 'no_evidence', evidence: [] }; });

  for (const variant of query.variants) {
    const response = await service.answer(randomUUID(), variant, [fixture.project.id]);
    assert.equal(response.resposta, NOT_FOUND_ANSWER);
    assert.deepEqual(response.fontes, []);
    assert.deepEqual(response.evidencias, []);
  }
  assert.equal(generationCalls, 0);
});

test('chat RAG QA fictício: nega projeto não autorizado antes de embedding e recusa vazamento de resultado', async () => {
  let embeddingCalls = 0;
  const question = fixture.queries[0].variants[0];
  const unauthorized = new RagService(new FixtureChats(), new FixtureSearch([fixtureRows[0]]), {
    embed: async () => { embeddingCalls += 1; return Array(1024).fill(0.1); },
  }, new FixtureRevisions(), { generate: async () => ({ coverage: 'no_evidence', evidence: [] }) });
  await assert.rejects(() => unauthorized.answer(randomUUID(), question, ['a1000000-0000-4000-8000-000000000099']), /Projeto não encontrado/);
  assert.equal(embeddingCalls, 0);

  const foreignProjectRow = { ...fixtureRows[0], project_id: 'a1000000-0000-4000-8000-000000000099' };
  const leaking = makeService([foreignProjectRow], async () => ({ coverage: 'no_evidence', evidence: [] }));
  await assert.rejects(() => leaking.answer(randomUUID(), question, [fixture.project.id]), /indisponível ou não conseguiu validar/);
});

test('chat RAG QA fictício: citação fabricada continua sendo recusada', async () => {
  const expectedRow = fixtureRows[0];
  const service = makeService([expectedRow], async () => ({
    coverage: 'complete', evidence: [{ source_id: expectedRow.id, quote: 'O projeto usa pagamentos por PIX.' }],
  }));
  // A citação inventada é descartada: o chat responde "sem evidência" em vez de falhar ou publicá-la.
  const answer = await service.answer(randomUUID(), fixture.queries[0].variants[0], [fixture.project.id]);
  assert.equal(answer.cobertura, 'no_evidence');
  assert.deepEqual(answer.fontes, []);
  assert.deepEqual(answer.evidencias, []);
  assert.doesNotMatch(answer.resposta, /PIX/);
});
