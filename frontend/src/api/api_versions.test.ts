import {afterEach,expect,it,vi} from 'vitest';
import {compareItemVersions,listItemVersions} from './api_versions';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.clearAllTimers();vi.useRealTimers();});
const row=(versao:number)=>({id:String(versao),versao,autor_id:null,autor_nome:null,created_at:'2026-10-25T12:00:00Z',acao:'ATUALIZAR_EPICO',justificativa:null});

it.each(['lista','comparação'])('encerra a consulta de %s que não responde, mesmo com sinal de cancelamento externo',async operation=>{
  vi.useFakeTimers();
  vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{
    const controller=new AbortController();setTimeout(()=>controller.abort(),ms);return controller.signal;
  });
  vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
    init.signal?.addEventListener('abort',()=>reject(new DOMException('Tempo excedido','AbortError')),{once:true});
  })));
  const controller=new AbortController();let outcome='aguardando';
  const query=operation==='lista'?listItemVersions('epico','item',controller.signal):compareItemVersions('epico','item',1,2,controller.signal);
  void query.then(()=>{outcome='sucesso';},()=>{outcome='falha';});
  await vi.advanceTimersByTimeAsync(16000);
  expect(outcome).toBe('falha');
  expect(controller.signal.aborted).toBe(false);
});

it.each([{items:{},next_before:null},{items:[row(1)],next_before:'1'},{items:[{...row(1),versao:'1'}],next_before:null}])('rejeita listagem malformada: %j',async body=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(body))));
  await expect(listItemVersions('epico','item',new AbortController().signal)).rejects.toThrow();
});

it.each([{anterior:row(1),nova:row(2),campos:{}},{anterior:null,nova:row(2),campos:[]},{anterior:row(1),nova:row(2),campos:[{campo:42,anterior:null,novo:'Título'}]}])('rejeita comparação malformada: %j',async body=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(body))));
  await expect(compareItemVersions('epico','item',1,2,new AbortController().signal)).rejects.toThrow();
});

it('preserva paginação e metadados de uma resposta válida',async()=>{
  const fetcher=vi.fn(async(_url:RequestInfo|URL)=>new Response(JSON.stringify({items:[row(2),row(1)],next_before:1})));
  vi.stubGlobal('fetch',fetcher);
  const result=await listItemVersions('pbi','item',new AbortController().signal,3);
  expect(result).toEqual({items:[row(2),row(1)],next_before:1});
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/audit/pbi/item/versions?limit=25&before=3');
});

it('preserva valores completos e a direção escolhida na comparação',async()=>{
  const text='Texto completo\n'.repeat(1000);
  const body={anterior:row(2),nova:row(1),campos:[{campo:'descricao',anterior:text,novo:null},{campo:'requer_interface',anterior:true,novo:false}]};
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(body))));
  expect(await compareItemVersions('epico','item',2,1,new AbortController().signal)).toEqual(body);
  await expect(compareItemVersions('epico','item',1,2,new AbortController().signal)).rejects.toThrow('Versões diferentes das solicitadas');
});

it('cancela uma consulta ao sair do item, sem aguardar o prazo máximo',async()=>{
  vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
    init.signal?.addEventListener('abort',()=>reject(new DOMException('Cancelado','AbortError')),{once:true});
  })));
  const controller=new AbortController();
  const result=expect(listItemVersions('epico','item',controller.signal)).rejects.toMatchObject({name:'AbortError'});
  controller.abort();await result;
});
