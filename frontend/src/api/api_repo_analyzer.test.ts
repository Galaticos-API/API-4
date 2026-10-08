import { afterEach, expect, it, vi } from 'vitest';
import { controlRepoAnalysis, startRepoAnalysis } from './api_repo_analyzer';

afterEach(() => vi.unstubAllGlobals());

it('envia a URL no campo repositorio_url esperado pela rota autenticada do backend', async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: 'analysis-1' }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', request);

    await startRepoAnalysis('project-1', 'https://github.com/owner/repo');

    const [url, options] = request.mock.calls[0];
    expect(url).toBe('/api/v1/projects/project-1/repo-analyses');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({ repositorio_url: 'https://github.com/owner/repo', perfil: 'quick' });
});

it('envia controle de pausa para a rota autenticada da análise', async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ id: 'analysis-1', status: 'pausada' }), { status: 200 }));
    vi.stubGlobal('fetch', request);
    await controlRepoAnalysis('project-1', 'analysis-1', 'pause');
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('/api/v1/projects/project-1/repo-analyses/analysis-1/pause');
    expect(options?.method).toBe('POST');
});
