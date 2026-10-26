import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { cleanupEvaluation, createEvaluationOutput } from './search-evaluation-utils.mjs';

test('uma nova execução não sobrescreve relatórios existentes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sinapse-s217-output-'));
  try {
    const output = join(root, 'results');
    await createEvaluationOutput(output);
    await writeFile(join(output, 'summary.json'), 'baseline');
    await assert.rejects(createEvaluationOutput(output), /já existe/);
    assert.equal(await readFile(join(output, 'summary.json'), 'utf8'), 'baseline');
    await createEvaluationOutput(join(root, 'other-results'));
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.startsWith(join(tmpdir(), 'sinapse-s217-output-')));
    await rm(root, { recursive: true, force: true });
  }
});

test('falha ao encerrar um recurso não impede a limpeza dos outros', async () => {
  const visited = [];
  const failures = await cleanupEvaluation([
    async () => { visited.push('server'); throw new Error('falha controlada'); },
    async () => { visited.push('pool'); },
    async () => { visited.push('ai'); throw new Error('falha controlada'); },
    async () => { visited.push('postgres'); },
  ]);
  assert.deepEqual(visited, ['server', 'pool', 'ai', 'postgres']);
  assert.equal(failures.length, 2);
  assert.deepEqual(await cleanupEvaluation([async () => {}]), []);
});
