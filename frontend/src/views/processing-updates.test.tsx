import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DocumentsView } from './documents/DocumentsView';
import { RepoAnalyzerView } from './projects/RepoAnalyzerView';
import { listDocuments, uploadDocument, type DocumentList, type ProjectDocument } from '../api/api_documents';
import { listRepoAnalyses, controlRepoAnalysis, type RepoAnalysis } from '../api/api_repo_analyzer';

vi.mock('../api/api_documents', async original => ({ ...await original<object>(), listDocuments: vi.fn(), uploadDocument: vi.fn() }));
vi.mock('../api/api_repo_analyzer', async original => ({ ...await original<object>(), listRepoAnalyses: vi.fn(), controlRepoAnalysis: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const page = (id: string, status: 'processado' | 'processando', next: string | null = null): DocumentList => ({
  items: [{ id, projeto_id: 'project', nome: id + '.txt', extensao: '.txt', mime: 'text/plain', tamanho_bytes: 10, status_processamento: status, armazenamento_pendente: false, autor_id: null, autor_nome: 'QA', created_at: '2026-10-25T12:00:00Z', updated_at: '2026-10-25T12:00:00Z' }],
  next_cursor: next, limites: { max_bytes: 1000000, extensoes_permitidas: ['.txt'] },
});
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const analysis = (project = 'project', completed = false): RepoAnalysis => ({
  id: project, projeto_id: project, repositorio_url: 'https://github.com/example/repo', run_id: 'run', status: completed ? 'concluido' : 'em_execucao', etapa: 'analisando', etapa_label: 'Executando', progresso: completed ? 100 : 10, created_at: '2026-10-25T12:00:00Z', updated_at: '2026-10-25T12:00:00Z', indexacao_status: 'aguardando_aprovacao', relatorio_markdown: completed ? 'RELATORIO_' + project : null,
});

test('atualização automática preserva páginas e acompanha processamento na segunda página', async () => {
  let completed = false;
  vi.mocked(listDocuments).mockImplementation(async (_id, options) => options?.cursor ? page('pagina-2', completed ? 'processado' : 'processando') : page('pagina-1', 'processado', 'cursor'));
  render(<DocumentsView projectId="project" />); await flush();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' })); });
  expect(screen.getByText('pagina-2.txt')).toBeTruthy();
  completed = true;
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(screen.getByText('pagina-2.txt')).toBeTruthy();
  expect(screen.queryByText('Processando')).toBeNull();
  expect(listDocuments).toHaveBeenCalledTimes(4);
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(listDocuments).toHaveBeenCalledTimes(4);
});

test('documentos não abrem consultas sobrepostas quando uma atualização leva mais de dez segundos', async () => {
  vi.mocked(listDocuments).mockResolvedValueOnce(page('doc', 'processando')).mockImplementation(() => new Promise(resolve => { setTimeout(() => resolve(page('doc', 'processado')), 12000); }));
  render(<DocumentsView projectId="project" />); await flush();
  await act(() => vi.advanceTimersByTimeAsync(25000));
  expect(listDocuments).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Processando')).toBeNull();
});

test('falha em uma página da atualização mantém a lista completa e permite a próxima tentativa', async () => {
  let fail = false;
  vi.mocked(listDocuments).mockImplementation(async (_id, options) => {
    if (options?.cursor && fail) throw new Error('Indisponível');
    return options?.cursor ? page('pagina-2', 'processado') : page('pagina-1', 'processando', 'cursor');
  });
  render(<DocumentsView projectId="project" />); await flush();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' })); });
  fail = true;
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(screen.getByText('pagina-2.txt')).toBeTruthy();
  expect(screen.getByRole('alert')).toBeTruthy();
  fail = false;
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(screen.getByText('pagina-2.txt')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('resposta de documentos do projeto anterior não substitui a lista do projeto atual', async () => {
  let finish: ((value: DocumentList) => void) | undefined;
  vi.mocked(listDocuments).mockResolvedValueOnce(page('antigo', 'processando')).mockImplementation((project) => project === 'other' ? Promise.resolve(page('atual', 'processado')) : new Promise(resolve => { finish = resolve; }));
  const view = render(<DocumentsView projectId="project" />); await flush();
  await act(() => vi.advanceTimersByTimeAsync(10000));
  view.rerender(<DocumentsView projectId="other" />); await flush();
  await act(async () => { finish?.(page('antigo', 'processado')); });
  expect(screen.getByText('atual.txt')).toBeTruthy();
  expect(screen.queryByText('antigo.txt')).toBeNull();
});

test('uma atualização iniciada antes do upload não apaga o documento recém-enviado da tela', async () => {
  let finish: ((value: DocumentList) => void) | undefined;
  vi.mocked(listDocuments).mockResolvedValueOnce(page('anterior', 'processando')).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  vi.mocked(uploadDocument).mockResolvedValue(page('enviado', 'processando').items[0]);
  render(<DocumentsView projectId="project" canWrite />); await flush();
  await act(() => vi.advanceTimersByTimeAsync(10000));
  fireEvent.change(screen.getByLabelText('Selecionar documento'), { target: { files: [new File(['teste'], 'qa.txt')] } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enviar documento' })); });
  await act(async () => { finish?.(page('anterior', 'processado')); });
  expect(screen.getByText('enviado.txt')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Atualizar' })).not.toBeDisabled();
});

test('upload do projeto anterior não altera os documentos nem libera o bloqueio de um novo upload', async () => {
  let finishOld: ((value: ProjectDocument) => void) | undefined;
  let finishCurrent: ((value: ProjectDocument) => void) | undefined;
  vi.mocked(listDocuments).mockImplementation(async project => page(project, 'processado'));
  vi.mocked(uploadDocument).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockImplementationOnce(() => new Promise(resolve => { finishCurrent = resolve; }));
  const view = render(<DocumentsView projectId="project" canWrite />); await flush();
  const send = async () => {
    fireEvent.change(screen.getByLabelText('Selecionar documento'), { target: { files: [new File(['teste'], 'qa.txt')] } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enviar documento' })); });
  };
  await send();
  view.rerender(<DocumentsView projectId="other" canWrite />); await flush();
  await send();
  await act(async () => { finishOld?.(page('antigo', 'processando').items[0]); });
  expect(screen.queryByText('antigo.txt')).toBeNull();
  expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled();
  await act(async () => { finishCurrent?.({ ...page('atual', 'processando').items[0], projeto_id: 'other' }); });
  expect(screen.getByText('atual.txt')).toBeTruthy();
  expect(uploadDocument).toHaveBeenCalledTimes(2);
});

test('RepoAnalyzer aplica uma resposta de cinco segundos sem iniciar outra consulta durante a espera', async () => {
  vi.mocked(listRepoAnalyses).mockResolvedValueOnce([analysis()]).mockImplementation(() => new Promise(resolve => { setTimeout(() => resolve([analysis('project', true)]), 5000); }));
  render(<RepoAnalyzerView projectId="project" canStart={false} />); await flush();
  await act(() => vi.advanceTimersByTimeAsync(10000));
  expect(screen.getByText('RELATORIO_project')).toBeTruthy();
  expect(listRepoAnalyses).toHaveBeenCalledTimes(2);
  await act(() => vi.advanceTimersByTimeAsync(12000));
  expect(listRepoAnalyses).toHaveBeenCalledTimes(2);
});

test('RepoAnalyzer recupera após uma falha de atualização', async () => {
  vi.mocked(listRepoAnalyses).mockResolvedValueOnce([analysis()]).mockRejectedValueOnce(new Error('Indisponível')).mockResolvedValue([analysis('project', true)]);
  render(<RepoAnalyzerView projectId="project" canStart={false} />); await flush();
  await act(() => vi.advanceTimersByTimeAsync(9000));
  expect(screen.getByText('RELATORIO_project')).toBeTruthy();
  expect(listRepoAnalyses).toHaveBeenCalledTimes(3);
});

test('RepoAnalyzer descarta a resposta de uma consulta cancelada ao trocar de projeto', async () => {
  let finish: ((value: RepoAnalysis[]) => void) | undefined;
  vi.mocked(listRepoAnalyses).mockResolvedValueOnce([analysis()]).mockImplementation(project => project === 'other' ? Promise.resolve([analysis('other', true)]) : new Promise(resolve => { finish = resolve; }));
  const view = render(<RepoAnalyzerView projectId="project" canStart={false} />); await flush();
  await act(() => vi.advanceTimersByTimeAsync(4000));
  view.rerender(<RepoAnalyzerView projectId="other" canStart={false} />); await flush();
  await act(async () => { finish?.([analysis('project', true)]); });
  expect(screen.getByText('RELATORIO_other')).toBeTruthy();
  expect(screen.queryByText('RELATORIO_project')).toBeNull();
});

test('uma consulta antiga não desfaz na tela a pausa confirmada pelo servidor', async () => {
  let finish: ((value: RepoAnalysis[]) => void) | undefined;
  const paused: RepoAnalysis = { ...analysis(), status: 'pausada', etapa_label: 'Pausada' };
  vi.mocked(listRepoAnalyses).mockResolvedValueOnce([analysis()]).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue([paused]);
  vi.mocked(controlRepoAnalysis).mockResolvedValue(paused);
  render(<RepoAnalyzerView projectId="project" canStart />); await flush();
  await act(() => vi.advanceTimersByTimeAsync(4000));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pausar' })); });
  await act(async () => { finish?.([analysis()]); });
  expect(screen.getByRole('button', { name: 'Retomar análise' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull();
  expect(listRepoAnalyses).toHaveBeenCalledTimes(3);
});
