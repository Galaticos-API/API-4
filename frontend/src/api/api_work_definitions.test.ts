import {afterEach,expect,it,vi} from 'vitest';
import {getWorkDefinitions,saveWorkDefinitions,type WorkDefinitions} from './api_work_definitions';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.clearAllTimers();vi.useRealTimers();});
const config:WorkDefinitions={version:1,updated_by:null,updated_by_name:null,updated_at:'2026-10-25T12:00:00Z',levels:{epico:{dor:[],dod:[]},feature:{dor:[],dod:[]},pbi:{dor:[],dod:[]}}};
it('encerra consulta sem resposta e permite a recuperação do painel',async()=>{
  vi.useFakeTimers();
  vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{const controller=new AbortController();setTimeout(()=>controller.abort(),ms);return controller.signal;});
  vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
    init.signal?.addEventListener('abort',()=>reject(new DOMException('Tempo excedido','AbortError')),{once:true});
  })));
  let outcome='aguardando';void getWorkDefinitions(new AbortController().signal).then(()=>{outcome='sucesso';},()=>{outcome='falha';});
  await vi.advanceTimersByTimeAsync(16000);expect(outcome).toBe('falha');
});
it.each([{...config,levels:{}},{...config,levels:{...config.levels,pbi:{dor:{},dod:[]}}},{...config,levels:{...config.levels,pbi:{dor:[42],dod:[]}}}])('rejeita definições malformadas antes de atualizar a tela: %j',async body=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(body))));
  await expect(getWorkDefinitions(new AbortController().signal)).rejects.toThrow();
});
it('não anuncia sucesso quando o salvamento retorna dados inválidos',async()=>{
  const dispatch=vi.spyOn(window,'dispatchEvent');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({version:2}))));
  await expect(saveWorkDefinitions(config)).rejects.toThrow();expect(dispatch).not.toHaveBeenCalled();
});
it.each(['\u0000','\uD800','\uDC00'])('rejeita condição recebida com Unicode inválido: %j',async invalid=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({...config,levels:{...config.levels,pbi:{dor:['Revisar '+invalid+' critérios'],dod:[]}}}))));
  await expect(getWorkDefinitions(new AbortController().signal)).rejects.toThrow();
});
it('preserva condições independentes e nome do autor após exclusão da conta',async()=>{
  const saved={...config,version:2,updated_by_name:'Administradora anterior',levels:{...config.levels,pbi:{dor:['História revisada'],dod:['Testes aprovados ✅ 😀']}}};
  const dispatch=vi.spyOn(window,'dispatchEvent');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(saved))));
  expect(await saveWorkDefinitions(saved)).toEqual(saved);
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({type:'work-definitions-updated'}));
});
it('aceita configuração inicial vazia e o conteúdo máximo permitido',async()=>{
  const conditions=Array.from({length:50},(_,i)=>String(i).padStart(3,'0')+'ã'.repeat(497));
  const maximum={...config,levels:{epico:{dor:conditions,dod:conditions},feature:{dor:conditions,dod:conditions},pbi:{dor:conditions,dod:conditions}}};
  vi.stubGlobal('fetch',vi.fn().mockImplementationOnce(async()=>new Response(JSON.stringify(config))).mockImplementationOnce(async()=>new Response(JSON.stringify(maximum))));
  expect(await getWorkDefinitions(new AbortController().signal)).toEqual(config);
  expect(await getWorkDefinitions(new AbortController().signal)).toEqual(maximum);
});
it('preserva cancelamento ao sair da tela',async()=>{
  vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
    init.signal?.addEventListener('abort',()=>reject(new DOMException('Cancelado','AbortError')),{once:true});
  })));
  const controller=new AbortController();
  const result=expect(getWorkDefinitions(controller.signal)).rejects.toMatchObject({name:'AbortError'});
  controller.abort();await result;
});
