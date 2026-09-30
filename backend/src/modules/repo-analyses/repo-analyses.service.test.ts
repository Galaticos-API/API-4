import test from 'node:test';
import assert from 'node:assert/strict';
import { mapAnalyzerProgress, mapAnalyzerStatus } from './repo-analyses.service';
import { RepoAnalysesService } from './repo-analyses.service';
import { RepoAnalysesRepository } from './repo-analyses.repository';
import axios from 'axios';

test('mapeia os estados reais do Analyzer para o contrato persistido pela API', () => {
    assert.equal(mapAnalyzerStatus('queued'), 'iniciado');
    assert.equal(mapAnalyzerStatus('running'), 'em_execucao');
    assert.equal(mapAnalyzerStatus('pausing'), 'pausando');
    assert.equal(mapAnalyzerStatus('paused'), 'pausada');
    assert.equal(mapAnalyzerStatus('cancelling'), 'cancelando');
    assert.equal(mapAnalyzerStatus('cancelled'), 'cancelada');
    assert.equal(mapAnalyzerStatus('completed'), 'concluido');
    assert.equal(mapAnalyzerStatus('failed'), 'falha');
    assert.throws(() => mapAnalyzerStatus('unexpected'), /Status desconhecido/);
});

test('consulta análise vinculada ao projeto da rota, não apenas por ID', async () => {
    const record = { id: 'analysis-1', projeto_id: 'project-a', status: 'concluido', run_id: 'run-1', relatorio_markdown: 'Relatório' };
    const repository = {
        findById: async (id: string, projectId: string) => id === record.id && projectId === record.projeto_id ? record : null,
    } as RepoAnalysesRepository;
    const service = new RepoAnalysesService(repository, 'http://localhost:8000');

    assert.equal(await service.getById('project-a', 'analysis-1'), record);
    assert.equal(await service.getById('project-b', 'analysis-1'), null);
});

test('calcula progresso limitado usando os campos stage_index/stage_count do Analyzer', () => {
    assert.equal(mapAnalyzerProgress(0, 6, 'iniciado'), 0);
    assert.equal(mapAnalyzerProgress(3, 6, 'em_execucao'), 33);
    assert.equal(mapAnalyzerProgress(4, 6, 'em_execucao', { calls_progress_percent: 50 }), 58);
    assert.equal(mapAnalyzerProgress(4, 6, 'em_execucao', { calls_progress_percent: 0 }), 50);
    assert.equal(mapAnalyzerProgress(6, 6, 'concluido'), 100);
    assert.equal(mapAnalyzerProgress(99, 6, 'em_execucao'), 99);
    assert.equal(mapAnalyzerProgress(2, 0, 'em_execucao'), 0);
});

test('marca como falha uma execução ativa ausente no motor, em vez de deixá-la ativa para sempre', async () => {
    const record = { id: 'analysis-1', projeto_id: 'project-a', status: 'em_execucao', run_id: 'run-gone' };
    const updates: Array<{ status: string; etapa: string; mensagem?: string }> = [];
    const repository = {
        findByProjectId: async () => [record],
        updateStatus: async (_runId: string, update: { status: string; etapa: string; mensagem?: string }) => {
            updates.push(update);
            Object.assign(record, update);
        },
    } as unknown as RepoAnalysesRepository;
    const originalGet = axios.get;
    axios.get = Object.assign(async () => {
        throw Object.assign(new Error('not found'), { isAxiosError: true, response: { status: 404 } });
    }, { ...originalGet });

    try {
        const service = new RepoAnalysesService(repository, 'http://localhost:8000');
        const [result] = await service.listByProject('project-a');

        assert.equal(result.status, 'falha');
        assert.equal(result.etapa, 'error');
        assert.match(result.mensagem ?? '', /Inicie uma nova análise/);
        assert.equal(updates.length, 1);
    } finally {
        axios.get = originalGet;
    }
});
