import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { HttpDocumentIngestionClient } from '../documents/document-ingestion.js';
import { ReportIndexingWorker } from './repo-analyses.indexing.worker.js';
import { ReportIndexingRepository } from './repo-analyses.indexing.repository.js';

const source = { id: '10000000-0000-4000-8000-000000000001', projeto_id: '20000000-0000-4000-8000-000000000001', run_id: 'run-42', repositorio_url: 'https://github.com/test/repo', perfil: 'quick', relatorio_markdown: '# Relatorio\nArquivo src/app.ts', indexacao_lease_id: 'lease', indexacao_tentativas: 1, aprovado_por: 'reviewer-po', aprovado_em: '2026-10-21T12:00:00Z', metadados: { source_commit: 'a'.repeat(40), source_ref: 'main', analyzed_paths: ['src/app.ts', 'outro.ts'] } };
const filename = `relatorio-${source.id}.md`;
function response() {
    return { document_id: source.id, project_id: source.projeto_id, chunks: [{ chunk_index: 0, text: 'Arquivo src/app.ts', embedding: Array(1024).fill(0.1), metadata: { project_id: source.projeto_id, document_id: source.id, source_name: filename } }] };
}
function setup() {
    const saved: any[] = [], failed: string[] = [];
    const repository = { claimPendingIndexing: async () => source, completeIndexing: async (_: unknown, chunks: unknown) => { saved.push(chunks); }, failIndexing: async (_: unknown, code: string) => { failed.push(code); } } as unknown as ReportIndexingRepository;
    const client = new HttpDocumentIngestionClient('http://test', 'x'.repeat(32));
    return { saved, failed, worker: new ReportIndexingWorker(repository, 'http://test', client) };
}

test('S2-23: reutiliza o pipeline de documentos e preserva origem, versao e caminhos citados', async t => {
    t.mock.method(axios, 'post', async (url: string, payload: any, options: any) => {
        assert.equal(url, 'http://test/documents/process');
        assert.equal(Buffer.from(payload.content_base64, 'base64').toString(), source.relatorio_markdown);
        assert.equal(options.headers['X-Document-Ingestion-Token'], 'x'.repeat(32));
        return { data: response() };
    });
    const { worker, saved, failed } = setup();
    await worker.tick();
    assert.equal(saved.length, 1); assert.deepEqual(failed, []);
    const meta = saved[0][0].metadata;
    assert.equal(meta.provenance, 'ai-accepted'); assert.equal(meta.reviewed_by, source.aprovado_por); assert.equal(meta.reviewed_at, source.aprovado_em);
    assert.equal(meta.project_id, source.projeto_id); assert.equal(meta.run_id, source.run_id);
    assert.equal(meta.source_commit, 'a'.repeat(40)); assert.equal(meta.source_ref, 'main');
    assert.equal(meta.repositorio_url, source.repositorio_url);
    assert.deepEqual(meta.cited_paths, ['src/app.ts']); assert.match(meta.report_version, /^[a-f0-9]{64}$/);
});

for (const mismatch of ['project', 'document', 'chunk-project', 'chunk-document', 'vector', 'empty'] as const) {
    test(`S2-23: rejeita resposta inconsistente (${mismatch})`, async t => {
        const data = response();
        if (mismatch === 'project') data.project_id = 'outro';
        if (mismatch === 'document') data.document_id = 'outro';
        if (mismatch === 'chunk-project') data.chunks[0].metadata.project_id = 'outro';
        if (mismatch === 'chunk-document') data.chunks[0].metadata.document_id = 'outro';
        if (mismatch === 'vector') data.chunks[0].embedding = Array(1024).fill(0);
        if (mismatch === 'empty') data.chunks = [];
        t.mock.method(axios, 'post', async () => ({ data }));
        const { worker, saved, failed } = setup(); await worker.tick();
        assert.equal(saved.length, 0); assert.equal(failed.length, 1);
    });
}

test('S2-23: falha recuperavel nao persiste nem registra dados do provedor', async t => {
    t.mock.method(axios, 'post', async () => { throw new Error('QA_PRIVATE_PROMPT'); });
    const logs: unknown[][] = []; t.mock.method(console, 'warn', (...args: unknown[]) => logs.push(args));
    const { worker, failed } = setup(); await worker.tick();
    assert.equal(failed.length, 1); assert.ok(!JSON.stringify({ failed, logs }).includes('QA_PRIVATE_PROMPT'));
});

test('S2-23: fila vazia nao chama o processamento', async t => {
    const post = t.mock.method(axios, 'post', async () => { throw new Error('nao chamar'); });
    await new ReportIndexingWorker({ claimPendingIndexing: async () => null } as unknown as ReportIndexingRepository).tick();
    assert.equal(post.mock.callCount(), 0);
});
