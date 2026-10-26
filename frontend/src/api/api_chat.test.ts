import {afterEach,expect,it,vi} from 'vitest';
import {askQuestion,describeChatError,listChatProjects} from './api_chat';
import {ApiError} from './api_auth';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.clearAllTimers();vi.useRealTimers();});

it('aguarda a geração válida mesmo quando embedding e modelo juntos passam de um minuto',async()=>{
  vi.useFakeTimers();
  vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{
    const controller=new AbortController();
    setTimeout(()=>controller.abort(),ms);
    return controller.signal;
  });
  vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>new Promise<Response>((resolve,reject)=>{
    const timer=setTimeout(()=>resolve(new Response(JSON.stringify({conversa_id:'conversation-a',resposta:'Resposta validada',fontes:[],origem:'assistente'}))),65000);
    init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('Consulta interrompida antes da conclusão'));},{once:true});
  })));
  const result=askQuestion({pergunta:'Consultar evidências',projetoId:'project-a'}).then(value=>({value}),error=>({error}));
  await vi.advanceTimersByTimeAsync(65000);
  expect(await result).toMatchObject({value:{resposta:'Resposta validada'}});
});

it.each([{id:42,nome:'Projeto'},{id:'project-a',nome:{texto:'Inválido'}}])('rejeita projetos malformados antes de chegar à interface: %j',async item=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({items:[item]}))));
  await expect(listChatProjects()).rejects.toThrow();
});

it('preserva o cancelamento solicitado por quem iniciou a consulta',async()=>{
  vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>{
    init.signal?.addEventListener('abort',()=>reject(new DOMException('Consulta cancelada','AbortError')),{once:true});
  })));
  const controller=new AbortController();
  const result=expect(askQuestion({pergunta:'Consultar evidências',projetoId:'project-a'},controller.signal)).rejects.toMatchObject({name:'AbortError'});
  controller.abort();
  await result;
});

it('mantém a navegação interna da fonte e descarta links externos ou malformados',async()=>{
  const urls=['/projects/project-a/documents','https://example.test','//example.test','/projects/\\example.test','/projects/project a'];
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({conversa_id:'conversation-a',resposta:'Evidências',origem:'assistente',fontes:urls.map((url,id)=>({id:String(id),titulo:'Documento',tipo:'documento',projeto_nome:'Projeto A',url}))}))));
  const result=await askQuestion({pergunta:'Consultar evidências',projetoId:'project-a'});
  expect(result.fontes.map(source=>source.url)).toEqual([urls[0],null,null,null,null]);
  expect(result.fontes[0].projeto_nome).toBe('Projeto A');
});

it('envia requisição DELETE com o id da conversa correto',async()=>{
  const fetchMock = vi.fn(async()=>new Response(null,{status:204}));
  vi.stubGlobal('fetch',fetchMock);
  const {deleteConversation} = await import('./api_chat');
  await deleteConversation('conv-123');
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/chat/conversations/conv-123'),
    expect.objectContaining({method:'DELETE'})
  );
});

it('exibe o ID de diagnóstico validado em falhas de serviço do chat',()=>{
  const id='e8e57e2d-0b59-4cdc-b191-d1618381c6a2';
  expect(describeChatError(new ApiError(503,{error:'Falha',details:{diagnostico_id:id}}))).toContain(id);
  expect(describeChatError(new ApiError(503,{error:'Falha',details:{diagnostico_id:'private prompt'}}))).not.toContain('private prompt');
});
