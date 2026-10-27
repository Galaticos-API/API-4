import {afterEach,expect,it,vi} from 'vitest';
import {askQuestion,describeChatError,listChatProjects,type ChatProgressStage} from './api_chat';
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

it('processa eventos de progresso fragmentados e só resolve com a resposta concluída',async()=>{
  const wire=[
    'event: progress\ndata: {"stage":"searching"}\n\n',
    'event: progress\ndata: {"stage":"synthesizing"}\n\n',
    'event: progress\ndata: {"stage":"validating"}\n\n',
    'event: completed\ndata: {"conversa_id":"conversation-a","resposta":"Resposta validada","fontes":[],"origem":"assistente"}\n\n',
  ].join('');
  const bytes=new TextEncoder().encode(wire);
  const body=new ReadableStream<Uint8Array>({start(controller){
    controller.enqueue(bytes.slice(0,29));
    controller.enqueue(bytes.slice(29,88));
    controller.enqueue(bytes.slice(88));
    controller.close();
  }});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(body,{headers:{'Content-Type':'text/event-stream; charset=utf-8'}})));
  const stages:ChatProgressStage[]=[];
  const result=await askQuestion({pergunta:'Consultar evidências',projetoId:'project-a'},undefined,stage=>stages.push(stage));
  expect(stages).toEqual(['searching','synthesizing','validating']);
  expect(result.resposta).toBe('Resposta validada');
  expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('/chat/query/stream'),expect.any(Object));
});

it('propaga erro seguro enviado como evento do fluxo',async()=>{
  const wire='event: error\ndata: {"status":503,"error":"Falha no RAG","code":"CHAT_FAILED","details":{"diagnostico_id":"e8e57e2d-0b59-4cdc-b191-d1618381c6a2"}}\n\n';
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(wire,{headers:{'Content-Type':'text/event-stream'}})));
  await expect(askQuestion({pergunta:'Consultar evidências',projetoId:'project-a'},undefined,()=>{}))
    .rejects.toMatchObject({status:503,details:{code:'CHAT_FAILED'}});
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

it('renomeia uma conversa com PATCH e retorna o título persistido',async()=>{
  const conversation={id:'conv-123',titulo:'Título atualizado',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:'2026-10-27T12:00:00.000Z'};
  const fetchMock=vi.fn(async()=>new Response(JSON.stringify(conversation),{headers:{'Content-Type':'application/json'}}));
  vi.stubGlobal('fetch',fetchMock);
  const {renameConversation}=await import('./api_chat');
  const result=await renameConversation('conv-123','Título atualizado');
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/chat/conversations/conv-123'),
    expect.objectContaining({method:'PATCH',body:JSON.stringify({titulo:'Título atualizado'})})
  );
  expect(result.titulo).toBe('Título atualizado');
});

it('envia requisição DELETE para a mensagem da conversa correta',async()=>{
  const fetchMock=vi.fn(async()=>new Response(null,{status:204}));
  vi.stubGlobal('fetch',fetchMock);
  const {deleteMessage}=await import('./api_chat');
  await deleteMessage('conv-123','message-456');
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/chat/conversations/conv-123/messages/message-456'),
    expect.objectContaining({method:'DELETE'})
  );
});

it('exibe o ID de diagnóstico validado em falhas de serviço do chat',()=>{
  const id='e8e57e2d-0b59-4cdc-b191-d1618381c6a2';
  expect(describeChatError(new ApiError(503,{error:'Falha',details:{diagnostico_id:id}}))).toContain(id);
  expect(describeChatError(new ApiError(503,{error:'Falha',details:{diagnostico_id:'private prompt'}}))).not.toContain('private prompt');
});
