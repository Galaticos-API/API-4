import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
test('harness: mock exige token, limita corpo e recupera após JSON inválido', async (t) => {
    const { createHarnessModel } = await import(pathToFileURL(resolve('scripts/harness-model.mjs')).href);
    const token = randomUUID();
    const server: Server = createHarnessModel(token);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    t.after(async () => {
        server.closeAllConnections();
        await new Promise<void>(r => server.close(() => r()));
    });
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    assert.equal((await fetch(base + '/control')).status, 401);
    const call = (body: string) => fetch(base + '/' + token + '/api/embeddings', { method: 'POST', body });
    assert.equal((await call('x'.repeat(256 * 1024 + 1))).status, 413);
    assert.equal((await call('{')).status, 400);
    const response = await call('{}');
    assert.equal(response.status, 200);
    assert.equal((await response.json() as {
        embedding: number[];
    }).embedding.length, 1024);
    await fetch(base + '/' + token + '/control', { method: 'POST', body: JSON.stringify({ unavailable: true }) });
    assert.equal((await call('{}')).status, 503);
});
