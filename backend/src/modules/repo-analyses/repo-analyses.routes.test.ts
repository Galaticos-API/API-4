import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { errorHandler } from '../../middleware/errorHandler';
import { AppError, ValidationError } from '../../shared/errors';
import { createRepoAnalysesRouter } from './repo-analyses.routes';
import { RepoAnalysesService } from './repo-analyses.service';
import type { RepoAnalysisRecord } from './repo-analyses.types';

const ACTIVE = 'a0000000-0000-4000-8000-000000000001';
const ARCHIVED = 'a0000000-0000-4000-8000-000000000002';
const OTHER = 'a0000000-0000-4000-8000-000000000003';
const ANALYSIS = 'e0000000-0000-4000-8000-000000000001';

const record = { id: ANALYSIS, projeto_id: ACTIVE, status: 'iniciado', run_id: 'r1' } as RepoAnalysisRecord;

class FakeService extends RepoAnalysesService {
    public started: Array<{ projectId: string; userId: string; url: string }> = [];
    public lookups: Array<{ projectId: string; id: string }> = [];
    public engineDown = false;

    constructor() {
        super({} as never, 'http://localhost:0');
    }

    async startAnalysis(projectId: string, userId: string, url: string): Promise<RepoAnalysisRecord> {
        if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(url)) throw new ValidationError('URL do repositório GitHub inválida.');
        if (this.engineDown) throw new AppError('Falha ao iniciar análise no motor de IA: serviço indisponível', 503, 'ANALYZER_UNAVAILABLE');
        this.started.push({ projectId, userId, url });
        return { ...record, projeto_id: projectId };
    }

    async listByProject(projectId: string): Promise<RepoAnalysisRecord[]> {
        return projectId === ACTIVE ? [record] : [];
    }

    async getById(projectId: string, id: string): Promise<RepoAnalysisRecord | null> {
        this.lookups.push({ projectId, id });
        return projectId === ACTIVE && id === ANALYSIS ? record : null;
    }
}

const service = new FakeService();
let server: Server;
let baseUrl: string;

before(() => {
    const app = express();
    app.use(express.json());
    const projects = {
        async findById(id: string) {
            if (id === ACTIVE || id === OTHER) return { id, status: 'ativo' };
            if (id === ARCHIVED) return { id, status: 'arquivado' };
            return null;
        },
    };
    app.use('/api/v1/projects/:projectId/repo-analyses', createRepoAnalysesRouter(service, projects, (req, res, next) => {
        if (req.headers['x-test-user'] !== 'ana') {
            res.status(401).json({ error: 'Autenticação necessária.', code: 'UNAUTHORIZED' });
            return;
        }
        req.auth = { id: 'b0000000-0000-4000-8000-000000000001', nome: 'Ana', email: 'a@example.com', role: 'po' };
        next();
    }));
    app.use(errorHandler);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/projects`;
});

after(() => {
    server.close();
});

const call = (path: string, init: { method?: string; json?: unknown; auth?: boolean } = {}) =>
    fetch(`${baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: { 'Content-Type': 'application/json', ...(init.auth === false ? {} : { 'x-test-user': 'ana' }) },
        body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });

test('exige autenticação', async () => {
    assert.equal((await call(`/${ACTIVE}/repo-analyses`, { auth: false })).status, 401);
});

test('id de projeto malformado retorna 400 e projeto inexistente retorna 404 antes de qualquer trabalho', async () => {
    assert.equal((await call('/nao-uuid/repo-analyses')).status, 400);
    assert.equal((await call('/a0000000-0000-4000-8000-0000000000ff/repo-analyses')).status, 404);
    assert.equal((await call('/nao-uuid/repo-analyses', { method: 'POST', json: { repositorio_url: 'https://github.com/a/b' } })).status, 400);
    assert.equal(service.started.length, 0);
});

test('inicia análise no projeto ativo com o usuário autenticado', async () => {
    const response = await call(`/${ACTIVE}/repo-analyses`, { method: 'POST', json: { repositorio_url: 'https://github.com/acme/api' } });
    assert.equal(response.status, 201);
    assert.deepEqual(service.started.at(-1), { projectId: ACTIVE, userId: 'b0000000-0000-4000-8000-000000000001', url: 'https://github.com/acme/api' });
});

test('URL inválida retorna 400 e falha do motor retorna 503 com mensagem legível', async () => {
    assert.equal((await call(`/${ACTIVE}/repo-analyses`, { method: 'POST', json: { repositorio_url: 'https://gitlab.com/a/b' } })).status, 400);
    assert.equal((await call(`/${ACTIVE}/repo-analyses`, { method: 'POST', json: {} })).status, 400);
    service.engineDown = true;
    const response = await call(`/${ACTIVE}/repo-analyses`, { method: 'POST', json: { repositorio_url: 'https://github.com/acme/api' } });
    service.engineDown = false;
    assert.equal(response.status, 503);
    assert.match(((await response.json()) as { error: string }).error, /motor de IA/);
});

test('projeto arquivado é somente leitura: consulta funciona e nova análise retorna 409', async () => {
    const before = service.started.length;
    const post = await call(`/${ARCHIVED}/repo-analyses`, { method: 'POST', json: { repositorio_url: 'https://github.com/acme/api' } });
    assert.equal(post.status, 409);
    assert.equal(service.started.length, before);
    assert.equal((await call(`/${ARCHIVED}/repo-analyses`)).status, 200);
});

test('consulta por id respeita o projeto da rota e valida o formato', async () => {
    assert.equal((await call(`/${ACTIVE}/repo-analyses/${ANALYSIS}`)).status, 200);
    assert.equal((await call(`/${OTHER}/repo-analyses/${ANALYSIS}`)).status, 404);
    assert.deepEqual(service.lookups.at(-1), { projectId: OTHER, id: ANALYSIS });
    assert.equal((await call(`/${ACTIVE}/repo-analyses/abc`)).status, 400);
    assert.deepEqual(await (await call(`/${OTHER}/repo-analyses`)).json(), []);
});
