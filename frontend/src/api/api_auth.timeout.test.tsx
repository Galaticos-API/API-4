import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { apiRequest } from './api_auth';
import { BacklogTechnologySelector } from '../views/backlog/BacklogTechnologySelector';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), ms);
    return controller.signal;
  });
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    const signal = init.signal!;
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

test('um sinal de cancelamento não remove o prazo padrão', async () => {
  const controller = new AbortController();
  const result = apiRequest('/technologies', { signal: controller.signal }).catch(error => error);
  await vi.advanceTimersByTimeAsync(15_000);
  expect((await result).name).toBe('TimeoutError');
  expect(controller.signal.aborted).toBe(false);
});

test('cancelar manualmente encerra a solicitação antes do timeout', async () => {
  const controller = new AbortController();
  const result = apiRequest('/technologies', { signal: controller.signal }).catch(error => error);
  controller.abort();
  expect((await result).name).toBe('AbortError');
});

test('prazo explícito maior preserva consultas de IA demoradas', async () => {
  const controller = new AbortController(); let ended = false;
  const result = apiRequest('/chat/query', { signal: controller.signal }, 90_000).finally(() => { ended = true; }).catch(error => error);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(ended).toBe(false);
  await vi.advanceTimersByTimeAsync(70_000);
  expect((await result).name).toBe('TimeoutError');
});

test('seletor sai do carregamento e permite repetir após indisponibilidade', async () => {
  render(<BacklogTechnologySelector value={[]} onChange={() => {}} />);
  await act(() => vi.advanceTimersByTimeAsync(20_000));
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('Não foi possível');
  expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
});
