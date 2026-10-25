import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { uploadDocument } from './api_documents';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), ms);
    return controller.signal;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const file = () => new File(['teste'], 'qa.txt');

test('upload que leva 20 segundos conclui sem ser cortado pelo prazo padrão de 15 segundos', async () => {
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    setTimeout(() => resolve(new Response(JSON.stringify({ id: 'doc', projeto_id: 'project', nome: 'qa.txt', status_processamento: 'pendente', created_at: '2026-10-25T12:00:00Z' }), { status: 201 })), 20000);
  })));
  let finished = false;
  const pending = uploadDocument('project', file()).finally(() => { finished = true; });
  await vi.advanceTimersByTimeAsync(15001);
  expect(finished).toBe(false);
  await vi.advanceTimersByTimeAsync(4999);
  expect((await pending).id).toBe('doc');
});

test('upload pendente termina em 120 segundos, inclusive quando recebe um sinal externo', async () => {
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
  })));
  const controller = new AbortController();
  const pending = uploadDocument('project', file(), controller.signal).catch(error => error);
  await vi.advanceTimersByTimeAsync(120000);
  expect((await pending).name).toBe('TimeoutError');
  expect(controller.signal.aborted).toBe(false);
});

test('cancelamento manual do upload é respeitado antes dos dois minutos', async () => {
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
  })));
  const controller = new AbortController();
  const pending = uploadDocument('project', file(), controller.signal).catch(error => error);
  controller.abort();
  expect((await pending).name).toBe('AbortError');
});
