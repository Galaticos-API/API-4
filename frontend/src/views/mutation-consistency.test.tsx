import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IngestionObservabilityView } from './admin/IngestionObservabilityView';
import { fetchIngestionSnapshot, reprocessIngestionDocument } from '../api/api_ingestion';

vi.mock('../api/api_ingestion', async original => ({ ...await original<object>(), fetchIngestionSnapshot: vi.fn(), reprocessIngestionDocument: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const pending = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const snapshot = (status: 'processando' | 'processado') => ({ counts: { pendente: 0, processando: status === 'processando' ? 1 : 0, processado: status === 'processado' ? 1 : 0, falha: 0 }, active: [], failed: [], recent: [{ id: 'doc', projeto_id: 'p', projeto_nome: 'QA', nome: 'documento.txt', extensao: '.txt', tamanho_bytes: 1, status_processamento: status, processamento_tentativas: 1, processamento_erro: null, processamento_proxima_tentativa: null, created_at: '', updated_at: '' }], generated_at: '' });

test('ingestão espera a atualização anterior e aplica o estado concluído no próximo ciclo', async () => {
  const old = pending<ReturnType<typeof snapshot>>();
  vi.mocked(fetchIngestionSnapshot).mockResolvedValueOnce(snapshot('processando')).mockReturnValueOnce(old.promise).mockResolvedValue(snapshot('processado'));
  render(<IngestionObservabilityView />); await flush();
  await act(() => vi.advanceTimersByTimeAsync(5000));
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(fetchIngestionSnapshot).toHaveBeenCalledTimes(2);
  await act(async () => { old.resolve(snapshot('processando')); });
  expect(screen.getByText('Processando', { selector: '.pipeline-step-label' })).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(document.querySelector('.ingestion-row--processado')).toBeTruthy();
});


test('reprocessar invalida a consulta antiga do painel de ingestão', async () => {
  const old = pending<any>();
  const initial = snapshot('processando');
  const failed = { ...initial.recent[0], status_processamento: 'falha' as const };
  vi.mocked(fetchIngestionSnapshot).mockResolvedValueOnce({ ...initial, failed: [failed] }).mockReturnValueOnce(old.promise).mockResolvedValue(snapshot('processado'));
  vi.mocked(reprocessIngestionDocument).mockResolvedValue(undefined);
  render(<IngestionObservabilityView />); await flush();
  await act(() => vi.advanceTimersByTimeAsync(5000));
  fireEvent.click(screen.getByRole('button', { name: 'Reprocessar' })); await flush();
  expect(document.querySelector('.ingestion-row--processado')).toBeTruthy();
  await act(async () => { old.resolve(initial); });
  expect(document.querySelector('.ingestion-row--processado')).toBeTruthy();
  expect(document.querySelector('.ingestion-row--processando')).toBeNull();
});


test('ingestão recupera uma falha na próxima atualização', async () => {
  vi.mocked(fetchIngestionSnapshot).mockResolvedValueOnce(snapshot('processando')).mockRejectedValueOnce(new Error('QA indisponível')).mockResolvedValue(snapshot('processado'));
  render(<IngestionObservabilityView />); await flush();
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(screen.getByText('Falha ao atualizar: QA indisponível')).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(document.querySelector('.ingestion-row--processado')).toBeTruthy();
  expect(screen.queryByText('Falha ao atualizar: QA indisponível')).toBeNull();
});
