import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { RepoAnalysesService } from './repo-analyses.service';
import { RepoAnalysesRepository } from './repo-analyses.repository';
import { ReportIndexingRepository } from './repo-analyses.indexing.repository';
import {
    ReportIndexingWorker,
} from './repo-analyses.indexing.worker';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function fakeAnalysis(overrides: Record<string, unknown> = {}) {
    return {
        id: 'a-1',
        projeto_id: 'p-1',
        run_id: 'run-1',
        repositorio_url: 'https://github.com/test/repo',
        perfil: 'quick',
        relatorio_markdown: '# Report\nSome analysis results.',
        indexacao_lease_id: 'lease-1',
        indexacao_tentativas: 1,
        metadados: {},
        ...overrides,
    };
}

function fakeChunks(count: number, projectId: string, analysisId: string) {
    return Array.from({ length: count }, (_, i) => ({
        chunk_index: i,
        text: `Chunk ${i} content for testing.`,
        embedding: Array.from({ length: 1024 }, (_, j) => (i + j) * 0.001),
        metadata: {
            project_id: projectId,
            document_id: analysisId,
            source_name: 'report.md',
        },
    }));
}

// ──────────────────────────────────────────────────────────────────────────────
// syncAnalysisStatus triggers indexing when report is first saved
// ──────────────────────────────────────────────────────────────────────────────

test('S2-23: syncAnalysisStatus marca indexação pendente quando relatório é salvo pela primeira vez', async () => {
    const analysis = {
        id: 'a-1', projeto_id: 'p-1', status: 'em_execucao', run_id: 'run-1',
        relatorio_markdown: undefined, revision: 0, dispatch_pending: false,
    };
    const statusUpdates: unknown[] = [];
    const indexingCalls: Array<{ id: string; projectId: string }> = [];

    const repository = {
        findByProjectId: async () => [analysis],
        findSyncable: async () => [analysis],
        updateStatus: async (_runId: string, update: Record<string, unknown>) => {
            statusUpdates.push(update);
            if (update.relatorioMarkdown) {
                (analysis as any).relatorio_markdown = update.relatorioMarkdown;
            }
        },
    } as unknown as RepoAnalysesRepository;

    const reportIndexing = {
        markPendingIndexing: async (id: string, projectId: string) => {
            indexingCalls.push({ id, projectId });
        },
    } as unknown as ReportIndexingRepository;

    const originalGet = axios.get;
    axios.get = (async (url: string) => {
        if (url.includes('/report')) return { data: '# Test Report\nContent' };
        return {
            data: {
                status: 'completed',
                stage: 'done',
                stage_label: 'Concluído',
                stage_index: 5,
                stage_count: 5,
            },
        };
    }) as any;

    try {
        const service = new RepoAnalysesService(repository, 'http://localhost:8000', reportIndexing);
        await service.listByProject('p-1');

        assert.equal(indexingCalls.length, 1, 'Deve chamar markPendingIndexing');
        assert.equal(indexingCalls[0].id, 'a-1');
        assert.equal(indexingCalls[0].projectId, 'p-1');
    } finally {
        axios.get = originalGet;
    }
});

test('S2-23: syncAnalysisStatus NÃO re-enfileira indexação se relatório já existia', async () => {
    const analysis = {
        id: 'a-2', projeto_id: 'p-1', status: 'concluido', run_id: 'run-2',
        relatorio_markdown: '# Old report', revision: 1, dispatch_pending: false,
    };
    const indexingCalls: Array<{ id: string; projectId: string }> = [];

    const repository = {
        findByProjectId: async () => [analysis],
        findSyncable: async () => [],
        updateStatus: async () => {},
    } as unknown as RepoAnalysesRepository;

    const reportIndexing = {
        markPendingIndexing: async (id: string, projectId: string) => {
            indexingCalls.push({ id, projectId });
        },
    } as unknown as ReportIndexingRepository;

    const originalGet = axios.get;
    axios.get = (async (url: string) => {
        if (url.includes('/report')) return { data: '# Old report' };
        return {
            data: {
                status: 'completed', stage: 'done', stage_label: 'Concluído',
                stage_index: 5, stage_count: 5,
            },
        };
    }) as any;

    try {
        const service = new RepoAnalysesService(repository, 'http://localhost:8000', reportIndexing);
        await service.listByProject('p-1');
        assert.equal(indexingCalls.length, 0, 'Não deve chamar markPendingIndexing quando relatório já existe');
    } finally {
        axios.get = originalGet;
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// Worker: validates chunks and delegates to repository
// ──────────────────────────────────────────────────────────────────────────────

test('S2-23: worker indexa relatório com sucesso quando AI service retorna chunks válidos', async () => {
    const analysis = fakeAnalysis();
    const chunks = fakeChunks(3, 'p-1', 'a-1');
    let completedWith: { analysis: unknown; chunks: unknown[] } | null = null;

    const repo = {
        claimPendingIndexing: async () => analysis,
        completeIndexing: async (a: unknown, c: unknown[]) => { completedWith = { analysis: a, chunks: c }; },
        failIndexing: async () => {},
    } as unknown as ReportIndexingRepository;

    const originalPost = axios.post;
    axios.post = (async () => ({
        data: {
            document_id: 'a-1',
            project_id: 'p-1',
            total_chunks: 3,
            chunks,
        },
    })) as any;

    try {
        const worker = new ReportIndexingWorker(repo, 'http://localhost:8000');
        await worker.tick();
        assert.ok(completedWith, 'Deve chamar completeIndexing');
        assert.equal((completedWith as any).chunks.length, 3);
    } finally {
        axios.post = originalPost;
    }
});

test('S2-23: worker chama failIndexing quando AI service retorna erro', async () => {
    const analysis = fakeAnalysis();
    let failedError: string | null = null;

    const repo = {
        claimPendingIndexing: async () => analysis,
        completeIndexing: async () => {},
        failIndexing: async (_a: unknown, error: string) => { failedError = error; },
    } as unknown as ReportIndexingRepository;

    const originalPost = axios.post;
    axios.post = Object.assign(async () => { throw new Error('service down'); }, { ...originalPost });

    try {
        const worker = new ReportIndexingWorker(repo, 'http://localhost:8000');
        await worker.tick();
        assert.ok(failedError, 'Deve chamar failIndexing');
        assert.match(failedError!, /PROCESSING_ERROR/);
    } finally {
        axios.post = originalPost;
    }
});

test('S2-23: worker ignora quando não há análises pendentes', async () => {
    let calledComplete = false;
    let calledFail = false;

    const repo = {
        claimPendingIndexing: async () => null,
        completeIndexing: async () => { calledComplete = true; },
        failIndexing: async () => { calledFail = true; },
    } as unknown as ReportIndexingRepository;

    const worker = new ReportIndexingWorker(repo, 'http://localhost:8000');
    await worker.tick();
    assert.equal(calledComplete, false);
    assert.equal(calledFail, false);
});

test('S2-23: worker rejeita chunks com embedding de dimensão incorreta', async () => {
    const analysis = fakeAnalysis();
    let failedError: string | null = null;

    const repo = {
        claimPendingIndexing: async () => analysis,
        completeIndexing: async () => {},
        failIndexing: async (_a: unknown, error: string) => { failedError = error; },
    } as unknown as ReportIndexingRepository;

    const originalPost = axios.post;
    axios.post = (async () => ({
        data: {
            document_id: 'a-1',
            project_id: 'p-1',
            total_chunks: 1,
            chunks: [{
                chunk_index: 0,
                text: 'Some content',
                embedding: [0.1, 0.2, 0.3], // Wrong dimension — should be 1024
                metadata: { project_id: 'p-1' },
            }],
        },
    })) as any;

    try {
        const worker = new ReportIndexingWorker(repo, 'http://localhost:8000');
        await worker.tick();
        assert.ok(failedError, 'Deve chamar failIndexing');
        assert.match(failedError!, /INVALID_EMBEDDING/);
    } finally {
        axios.post = originalPost;
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// Isolamento por projeto: chunk metadata contém projeto_id correto
// ──────────────────────────────────────────────────────────────────────────────

test('S2-23: metadata dos chunks preserva projeto_id, run_id, repositorio_url e perfil', async () => {
    const analysis = fakeAnalysis({ projeto_id: 'project-xyz', run_id: 'run-42', repositorio_url: 'https://github.com/org/repo', perfil: 'complete' });
    const chunks = fakeChunks(1, 'project-xyz', 'a-1');
    let savedChunks: unknown[] = [];

    const repo = {
        claimPendingIndexing: async () => analysis,
        completeIndexing: async (_a: unknown, c: unknown[]) => { savedChunks = c; },
        failIndexing: async () => {},
    } as unknown as ReportIndexingRepository;

    const originalPost = axios.post;
    axios.post = (async () => ({
        data: { document_id: 'a-1', project_id: 'project-xyz', total_chunks: 1, chunks },
    })) as any;

    try {
        const worker = new ReportIndexingWorker(repo, 'http://localhost:8000');
        await worker.tick();
        assert.equal(savedChunks.length, 1);
        const meta = (savedChunks[0] as any).metadata;
        assert.equal(meta.project_id, 'project-xyz', 'projeto_id deve estar nos metadados');
        assert.equal(meta.run_id, 'run-42', 'run_id deve estar nos metadados');
        assert.equal(meta.repositorio_url, 'https://github.com/org/repo', 'repositorio_url deve estar nos metadados');
        assert.equal(meta.perfil, 'complete', 'perfil deve estar nos metadados');
        assert.equal(meta.source_type, 'analise_repositorio', 'source_type deve ser analise_repositorio');
    } finally {
        axios.post = originalPost;
    }
});
