import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { applyUntil } from '../src/database/migration-test-utils.js';

const id = 'sinapse-review-' + randomUUID().slice(0, 8);
const password = randomUUID();
const storage = await mkdtemp(join(tmpdir(), id + '-'));
let started = false;
let embeddings: import('node:http').Server | undefined;
let api: ReturnType<typeof import('node:http').createServer> | undefined;
let web: { httpServer: import('node:http').Server } | undefined;
let db: { end(): Promise<void> } | undefined;
function docker(args: string[]) {
    const result = spawnSync('docker', args, { encoding: 'utf8' });
    if (result.status !== 0) throw new Error('Docker indisponível para o QA isolado.');
    return result.stdout.trim();
}
try {
    docker(['run', '-d', '--name', id, '-e', 'POSTGRES_USER=sinapse', '-e', 'POSTGRES_PASSWORD=' + password,
        '-e', 'POSTGRES_DB=sinapse_e2e_test', '-p', '127.0.0.1::5432', 'pgvector/pgvector:pg16']);
    started = true;
    const port = JSON.parse(docker(['inspect', id]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort;
    const url = 'postgresql://sinapse:' + password + '@127.0.0.1:' + port + '/sinapse_e2e_test';
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
        if (spawnSync('docker', ['exec', id, 'pg_isready', '-h', '127.0.0.1', '-U', 'sinapse'], { stdio: 'ignore' }).status === 0) { ready = true; break; }
        await new Promise(r => setTimeout(r, 500));
    }
    if (!ready) throw new Error('PostgreSQL não iniciou.');
    Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: url, E2E_DATABASE_URL: url,
        DOCUMENT_STORAGE_DIR: storage, AI_SERVICE_URL: 'http://127.0.0.1:9', REPO_ANALYZER_URL: 'http://127.0.0.1:9' });
    const migration = new Client({ connectionString: url });
    await migration.connect();
    try { await applyUntil(migration, true, () => false); } finally { await migration.end(); }
    const { startEmbeddingService } = await import('../../e2e/embedding-service.mjs');
    const embeddingService = await startEmbeddingService();
    embeddings = embeddingService.server;
    process.env.AI_SERVICE_URL = embeddingService.url;
    const { app } = await import('../src/app.js');
    const { pool } = await import('../src/database/db.js');
    db = pool;
    api = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => api!.once('listening', r));
    const apiUrl = 'http://127.0.0.1:' + (api.address() as { port: number }).port;
    const { preview } = await import('../../frontend/node_modules/vite/dist/node/index.js');
    const frontend = await preview({ root: resolve('../frontend'), configFile: false,
        preview: { host: '127.0.0.1', port: 5190, strictPort: true, proxy: { '/api': { target: apiUrl, changeOrigin: true } } } });
    web = frontend;
    process.exitCode = await new Promise<number>((resolveExit, reject) => {
        const child = spawn(process.execPath, ['run.mjs'], { cwd: resolve('../e2e'), stdio: 'inherit',
            env: { ...process.env, E2E_API_URL: apiUrl + '/api/v1', E2E_APP_URL: 'http://127.0.0.1:5190',
                ...(process.platform === 'win32' && !process.env.E2E_CHROME_PATH ? { E2E_CHROME_PATH: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' } : {}) } });
        child.once('error', reject);
        child.once('exit', code => resolveExit(code ?? 1));
    });
} finally {
    if (web) await new Promise<void>(r => web!.httpServer.close(() => r()));
    if (api) { api.closeAllConnections(); await new Promise<void>(r => api!.close(() => r())); }
    if (db) await db.end();
    if (embeddings) { embeddings.closeAllConnections(); await new Promise<void>(r => embeddings!.close(() => r())); }
    if (started) docker(['rm', '-f', '-v', id]);
    if (!storage.startsWith(join(tmpdir(), id + '-'))) throw new Error('Diretório temporário inesperado.');
    await rm(storage, { recursive: true, force: true });
    console.log('Banco e arquivos temporários de QA removidos.');
}
