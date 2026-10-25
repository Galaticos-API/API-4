import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IngestionObservabilityView } from './admin/IngestionObservabilityView';
import { DecisionsPanel } from './backlog/DecisionsPanel';
import { CriteriaEditor } from './backlog/CriteriaView';
import { fetchIngestionSnapshot, reprocessIngestionDocument } from '../api/api_ingestion';
import { listDecisions, createDecision } from '../api/api_decisions';
import { listCriteria, moveCriterion, deleteCriterion } from '../api/api_backlog';

vi.mock('../api/api_ingestion', async original => ({ ...await original<object>(), fetchIngestionSnapshot: vi.fn(), reprocessIngestionDocument: vi.fn() }));
vi.mock('../api/api_decisions', async original => ({ ...await original<object>(), listDecisions: vi.fn(), createDecision: vi.fn() }));
vi.mock('../api/api_backlog', async original => ({ ...await original<object>(), listCriteria: vi.fn(), moveCriterion: vi.fn(), deleteCriterion: vi.fn() }));
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

test('decisão salva durante carregamento cancela o GET antigo e aparece na lista atualizada', async () => {
  const listing = pending<any>();
  const origem = { tipo: 'epico', id: 'e', titulo: 'QA', codigo: null, herdada: false };
  const created = { id: 'd', titulo: 'Decisão nova', contexto: 'Contexto QA', decisao: 'Escolha QA', justificativa: 'Motivo QA', alternativas: '', autor: null, created_at: '2026-10-25T12:00:00Z', origem };
  vi.mocked(createDecision).mockResolvedValue(created as any);
  vi.mocked(listDecisions).mockReturnValueOnce(listing.promise).mockResolvedValue({ entidade: origem, ancestrais: [], decisoes: [created] } as any);
  render(<DecisionsPanel kind="epico" id="e" canWrite />); await flush();
  fireEvent.click(screen.getByRole('button', { name: 'Registrar decisão' }));
  for (const [label, value] of [['Título', 'Decisão nova'], ['Contexto', 'Contexto QA'], ['Decisão', 'Escolha QA'], ['Justificativa', 'Motivo QA']]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.submit(screen.getByRole('button', { name: 'Registrar decisão' }).closest('form')!); await flush();
  expect(createDecision).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Decisão registrada com autor e data.')).toBeTruthy();
  await act(async () => { listing.resolve({ entidade: origem, ancestrais: [], decisoes: [] }); });
  expect(screen.queryByText('Nenhuma decisão registrada')).toBeNull();
  expect(screen.getByText('Decisão nova')).toBeTruthy();
  expect(listDecisions).toHaveBeenCalledTimes(2);
});

test('reordenação bloqueia remoção concorrente e permite remover depois de concluir', async () => {
  const a = { id: 'a', entidade_tipo: 'epico', entidade_id: 'e', ordem: 1, texto: 'Critério A' };
  const b = { id: 'b', entidade_tipo: 'epico', entidade_id: 'e', ordem: 2, texto: 'Critério B' };
  const moving = pending<any>();
  vi.mocked(listCriteria).mockResolvedValue([a, b] as any);
  vi.mocked(moveCriterion).mockReturnValue(moving.promise);
  vi.mocked(deleteCriterion).mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<CriteriaEditor entidadeTipo="epico" entidadeId="e" titulo="QA" canEdit />); await flush();
  fireEvent.click(screen.getAllByRole('button', { name: 'Mover para baixo' })[0]); await flush();
  fireEvent.click(screen.getAllByRole('button', { name: 'Remover' })[1]); await flush();
  expect(deleteCriterion).not.toHaveBeenCalled();
  expect(screen.getAllByRole('button', { name: 'Remover' })[1]).toBeDisabled();
  await act(async () => { moving.resolve([{ ...b, ordem: 1 }, { ...a, ordem: 2 }]); });
  fireEvent.click(screen.getAllByRole('button', { name: 'Remover' })[0]); await flush();
  expect(deleteCriterion).toHaveBeenCalledWith('b', undefined);
  expect(screen.queryByText('Critério B')).toBeNull();
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
