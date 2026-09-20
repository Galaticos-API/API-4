import test from 'node:test';
import assert from 'node:assert/strict';
import { mapAnalyzerProgress, mapAnalyzerStatus } from './repo-analyses.service';
import { RepoAnalysesService } from './repo-analyses.service';
import { RepoAnalysesRepository } from './repo-analyses.repository';

test('mapeia os estados reais do Analyzer para o contrato persistido pela API', () => {
    assert.equal(mapAnalyzerStatus('queued'), 'iniciado');
    assert.equal(mapAnalyzerStatus('running'), 'em_execucao');
    assert.equal(mapAnalyzerStatus('completed'), 'concluido');
    assert.equal(mapAnalyzerStatus('failed'), 'falha');
    assert.throws(() => mapAnalyzerStatus('unexpected'), /Status desconhecido/);
});

test('consulta análise vinculada ao projeto da rota, não apenas por ID', async () => {
    const record = { id: 'analysis-1', projeto_id: 'project-a', status: 'concluido', run_id: 'run-1' };
    const repository = {
        findById: async (id: string, projectId: string) => id === record.id && projectId === record.projeto_id ? record : null,
    } as RepoAnalysesRepository;
    const service = new RepoAnalysesService(repository, 'http://localhost:8000');

    assert.equal(await service.getById('project-a', 'analysis-1'), record);
    assert.equal(await service.getById('project-b', 'analysis-1'), null);
});

test('calcula progresso limitado usando os campos stage_index/stage_count do Analyzer', () => {
    assert.equal(mapAnalyzerProgress(0, 6, 'iniciado'), 0);
    assert.equal(mapAnalyzerProgress(3, 6, 'em_execucao'), 50);
    assert.equal(mapAnalyzerProgress(6, 6, 'concluido'), 100);
    assert.equal(mapAnalyzerProgress(99, 6, 'em_execucao'), 99);
    assert.equal(mapAnalyzerProgress(2, 0, 'em_execucao'), 0);
});
