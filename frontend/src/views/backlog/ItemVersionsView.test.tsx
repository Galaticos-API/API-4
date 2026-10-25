import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ItemVersionsView } from './ItemVersionsView';
import { listItemVersions, compareItemVersions } from '../../api/api_versions';
vi.mock('../../api/api_versions',()=>({listItemVersions:vi.fn(),compareItemVersions:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const row=(versao:number)=>({id:String(versao),versao,autor_id:'po',autor_nome:'Giovanni',created_at:'2026-10-25T12:00:00Z',acao:'ATUALIZAR_EPICO',justificativa:null});
it('lista autor/data e compara duas versões destacando valores anterior e novo',async()=>{
  vi.mocked(listItemVersions).mockResolvedValue({items:[row(2),row(1)],next_before:null});
  vi.mocked(compareItemVersions).mockResolvedValue({anterior:row(1),nova:row(2),campos:[{campo:'titulo',anterior:'Título original',novo:'Título atualizado'}]});
  render(<ItemVersionsView kind="epico" id="epic" />);
  await screen.findByText('Versão 2');
  expect(screen.getAllByText('Giovanni')).toHaveLength(2);
  const compare=screen.getByRole('button',{name:'Comparar versões'});
  expect(compare).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Versão de origem'),{target:{value:'1'}});
  fireEvent.change(screen.getByLabelText('Versão de destino'),{target:{value:'1'}});
  expect(compare).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Versão de destino'),{target:{value:'2'}});
  fireEvent.click(compare);
  await screen.findByText('Título original'); expect(screen.getByText('Título atualizado')).toBeInTheDocument();
  expect(compareItemVersions).toHaveBeenCalledWith('epico','epic',1,2,expect.any(AbortSignal));
});
it('recupera falha de carregamento e mostra ausência de versões',async()=>{
  vi.mocked(listItemVersions).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({items:[],next_before:null});
  render(<ItemVersionsView kind="pbi" id="pbi" />);
  await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button',{name:'Recarregar versões'}));
  await screen.findByText('Nenhuma versão registrada para este item.');
});
it('ignora respostas de um item anterior e permite paginação',async()=>{
  let resolveOld: (value: Awaited<ReturnType<typeof listItemVersions>>)=>void = ()=>{};
  vi.mocked(listItemVersions).mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}))
    .mockResolvedValueOnce({items:[row(3),row(2)],next_before:2}).mockResolvedValueOnce({items:[row(1)],next_before:null});
  const view=render(<ItemVersionsView kind="pbi" id="old" />);
  view.rerender(<ItemVersionsView kind="pbi" id="new" />);
  await screen.findByText('Versão 3');
  resolveOld({items:[row(99)],next_before:null});
  fireEvent.click(screen.getByRole('button',{name:'Carregar mais versões'}));
  await screen.findByText('Versão 1');
  await waitFor(()=>expect(screen.queryByText('Versão 99')).not.toBeInTheDocument());
});
