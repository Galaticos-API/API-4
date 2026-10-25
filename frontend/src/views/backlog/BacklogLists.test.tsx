import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EpicList } from './EpicsView';
import { FeatureList } from './FeaturesView';
import { PbiList } from './PbiList';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const item = (n: number) => ({ id: 'item-' + n, projeto_id: 'project', epico_id: 'epic', feature_id: 'feature', titulo: 'Item ' + n, status: 'rascunho' });
const response = (items: unknown[], status = 200) => new Response(JSON.stringify({ items, total: 101 }), { status });

for (const kind of ['epic', 'feature', 'pbi'] as const) {
  test(`${kind}: carrega o item 101 e impede uma segunda solicitação simultânea`, async () => {
    const offsets: number[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const offset = Number(new URL(url, 'http://localhost').searchParams.get('offset'));
      offsets.push(offset);
      return response(offset ? [item(100)] : Array.from({ length: 100 }, (_, n) => item(n)));
    }));
    if (kind === 'epic') render(<EpicList projetoId="project" canCreate={false} />);
    else if (kind === 'feature') render(<FeatureList projectId="project" epicoId="epic" canCreate={false} />);
    else render(<PbiList projectId="project" epicoId="epic" featureId="feature" canCreate={false} />);
    const button = await screen.findByRole('button', { name: 'Carregar mais' });
    fireEvent.click(button); fireEvent.click(button);
    await screen.findByRole('heading', { name: /Item 100$/ });
    expect(screen.getByRole('heading', { name: /Item 0$/ })).toBeTruthy();
    expect(offsets).toEqual([0, 100]);
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
  });
}

for (const kind of ['epic', 'feature'] as const) {
  test(`${kind}: Todos envia o filtro e inclui os arquivados`, async () => {
    const statuses: (string | null)[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const status = new URL(url, 'http://localhost').searchParams.get('status'); statuses.push(status);
      return response(status === 'todos' ? [item(0), { ...item(1), titulo: 'Item arquivado', status: 'arquivado' }] : [item(0)]);
    }));
    if (kind === 'epic') render(<EpicList projetoId="project" canCreate={false} />);
    else render(<FeatureList projectId="project" epicoId="epic" canCreate={false} />);
    await screen.findByText('Item 0');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'todos' } });
    await screen.findByText('Item arquivado');
    expect(statuses).toEqual([null, 'todos']);
  });
}

test('falha na continuação preserva os itens e permite repetir a mesma página', async () => {
  const offsets: number[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const offset = Number(new URL(url, 'http://localhost').searchParams.get('offset')); offsets.push(offset);
    if (offsets.length === 2) return response([], 503);
    return response(offset ? [item(100)] : Array.from({ length: 100 }, (_, n) => item(n)));
  }));
  render(<EpicList projetoId="project" canCreate={false} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
  await screen.findByRole('alert');
  expect(screen.getByText('Item 0')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar carregar mais' }));
  await screen.findByText('Item 100');
  expect(offsets).toEqual([0, 100, 100]);
});

test('trocar o projeto cancela uma continuação antiga e reinicia o offset', async () => {
  let finish: ((value: Response) => void) | undefined;
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const params = new URL(url, 'http://localhost').searchParams;
    if (params.get('projeto_id') === 'other') return Promise.resolve(response([{ ...item(200), titulo: 'Outro projeto' }]));
    if (params.get('offset') === '100') return new Promise<Response>(resolve => { finish = resolve; });
    return Promise.resolve(response(Array.from({ length: 100 }, (_, n) => item(n))));
  }));
  const view = render(<EpicList projetoId="project" canCreate={false} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
  view.rerender(<EpicList projetoId="other" canCreate={false} />);
  await screen.findByText('Outro projeto');
  finish?.(response([item(100)]));
  await waitFor(() => expect(screen.queryByText('Item 100')).toBeNull());
});

for (const kind of ['epic', 'feature', 'pbi'] as const) {
  test(`${kind}: usa o cursor recebido e não duplica um cartão repetido pelo servidor`, async () => {
    const cursors: (string | null)[] = [];
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const before = new URL(url, 'http://localhost').searchParams.get('before'); cursors.push(before);
      return new Response(JSON.stringify({ items: before ? [item(99), item(100)] : Array.from({ length: 100 }, (_, n) => item(n)), next_cursor: before ? null : 'opaque-cursor', total: 102 }), { status: 200 });
    }));
    try {
      if (kind === 'epic') render(<EpicList projetoId="project" canCreate={false} />);
      else if (kind === 'feature') render(<FeatureList projectId="project" epicoId="epic" canCreate={false} />);
      else render(<PbiList projectId="project" epicoId="epic" featureId="feature" canCreate={false} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
      await screen.findByRole('heading', { name: /Item 100$/ });
      expect(screen.getAllByRole('heading', { name: /Item 99$/ })).toHaveLength(1);
      expect(cursors).toEqual([null, 'opaque-cursor']);
      expect(errors).not.toHaveBeenCalled();
    } finally { errors.mockRestore(); }
  });
}
