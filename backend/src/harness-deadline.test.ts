import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const helper = pathToFileURL(resolve('scripts/harness-deadline.mjs')).href;
test('harness: espera sem sockets ativos termina por timeout, sem encerrar com código 13', () => {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
        import { withHarnessDeadline } from ${JSON.stringify(helper)};
        try {
            await withHarnessDeadline(() => new Promise(() => {}), 30);
            process.exitCode = 1;
        } catch (error) {
            if (!error.message.includes('Tempo limite')) throw error;
            console.log('timeout-controlado');
        }
    `], { encoding: 'utf8', timeout: 3000 });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /timeout-controlado/);
});
test('harness: sucesso libera o timer e permite encerramento imediato', () => {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
        import { withHarnessDeadline } from ${JSON.stringify(helper)};
        const value = await withHarnessDeadline(() => Promise.resolve('pronto'), 60000);
        console.log(value);
    `], { encoding: 'utf8', timeout: 3000 });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /pronto/);
});
