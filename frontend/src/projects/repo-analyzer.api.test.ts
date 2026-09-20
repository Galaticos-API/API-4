import { afterEach, expect, it, vi } from 'vitest';
import { startRepoAnalysis } from './repo-analyzer.api';

afterEach(() => vi.unstubAllGlobals());

it('envia a URL no campo repositorio_url esperado pela rota autenticada do backend', async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: 'analysis-1' }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', request);

    await startRepoAnalysis('project-1', 'https://github.com/owner/repo');

    const [url, options] = request.mock.calls[0];
    expect(url).toBe('/api/v1/projects/project-1/repo-analyses');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({ repositorio_url: 'https://github.com/owner/repo' });
});
