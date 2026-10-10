import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { RepoAnalysesService } from './repo-analyses.service';
import { RepoAnalysesRepository } from './repo-analyses.repository';
import type { RepoAnalysisRecord } from './repo-analyses.types';

test('recupera relatório em consulta posterior à conclusão após falha transitória', async t => {
  const record = { id: 'a', projeto_id: 'p', run_id: 'r', status: 'em_execucao' } as RepoAnalysisRecord;
  let reports = 0;
  t.mock.method(axios, 'get', async (url: string) => {
    if (url.endsWith('/report')) {
      if (++reports === 1) throw new Error('network');
      return { data: '# Relatório recuperado' };
    }
    return { data: { status: 'completed', stage: 'done' } };
  });
  const repository = {
    findById: async () => record,
    updateStatus: async (_: string, update: { status: string; relatorioMarkdown?: string }) => {
      Object.assign(record, { status: update.status, relatorio_markdown: update.relatorioMarkdown });
    },
  } as unknown as RepoAnalysesRepository;
  const service = new RepoAnalysesService(repository);
  await service.getById('p', 'a');
  assert.equal(record.status, 'concluido');
  assert.equal(record.relatorio_markdown, undefined);
  await service.getById('p', 'a');
  assert.equal(record.relatorio_markdown, '# Relatório recuperado');
  await service.getById('p', 'a');
  assert.equal(reports, 2);
});

test('falha ao persistir solicitação não inicia trabalho no Python', async t => {
  const post = t.mock.method(axios, 'post', async () => { throw new Error('não deveria enviar'); });
  const repository = { create: async () => { throw new Error('DB unavailable'); } } as unknown as RepoAnalysesRepository;
  await assert.rejects(new RepoAnalysesService(repository).startAnalysis('p', 'u', 'https://github.com/acme/repo'), /DB unavailable/);
  assert.equal(post.mock.callCount(), 0);
});

test('retry de despacho após resposta perdida mantém o identificador da execução', async t => {
  const record = { id: 'a', run_id: 'stable-id', repositorio_url: 'https://github.com/acme/repo', perfil: 'quick' };
  const sent: unknown[] = [];
  let attempts = 0;
  t.mock.method(axios, 'post', async (_url: string, body: unknown) => {
    sent.push(body);
    if (++attempts === 1) throw new Error('response lost');
    return { data: { run_id: record.run_id } };
  });
  const results: (string | undefined)[] = [];
  const repository = {
    claimDispatch: async () => record,
        findById: async () => record,
    finishDispatch: async (_record: unknown, error?: string) => { results.push(error); },
    findSyncable: async () => [],
  } as unknown as RepoAnalysesRepository;
  const service = new RepoAnalysesService(repository);
  await service.processQueue(); await service.processQueue();
  assert.deepEqual(sent[0], sent[1]);
  assert.ok(results[0]); assert.equal(results[1], undefined);
});
