import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {ChatView} from './ChatView';
import {askQuestion,deleteConversation,deleteMessage,listChatProjects,listConversations,listMessages,renameConversation,type ChatAnswer,type ChatConversation,type ChatProgressStage} from '../../api/api_chat';
import {ApiError} from '../../api/api_auth';
vi.mock('../../api/api_chat',()=>({MAX_QUESTION_LENGTH:2000,askQuestion:vi.fn(),deleteConversation:vi.fn(),deleteMessage:vi.fn(),listChatProjects:vi.fn(),listConversations:vi.fn(),listMessages:vi.fn(),renameConversation:vi.fn(),describeChatError:()=> 'Assistente indisponível'}));
const speechInstances: FakeSpeechRecognition[]=[];
class FakeSpeechRecognition {
  lang='';
  continuous=false;
  interimResults=false;
  onstart:(()=>void)|null=null;
  onresult:((event:{results:Array<{isFinal:boolean;0:{transcript:string}}>} )=>void)|null=null;
  onerror:((event:{error:string})=>void)|null=null;
  onend:(()=>void)|null=null;
  start=vi.fn();
  stop=vi.fn(()=>this.onend?.());
  abort=vi.fn();
  constructor(){speechInstances.push(this);}
}
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.resetAllMocks();vi.unstubAllGlobals();speechInstances.length=0;});
it('abre e fecha o histórico mobile com foco acessível e Escape',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  render(<ChatView/>);
  const trigger=screen.getByRole('button',{name:'Abrir navegação de conversas'});
  fireEvent.click(trigger);
  const dialog=screen.getByRole('dialog',{name:'Conversas'});
  expect(dialog).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Fechar conversas'})).toHaveFocus();
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(document,{key:'Escape'});
  await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Conversas'})).toBeNull());
  expect(document.body.style.overflow).toBe('');
  expect(trigger).toHaveFocus();
});
it('recolhe só o histórico e mantém a conversa na coluna de conteúdo',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  const {container}=render(<ChatView/>);
  const layout=container.querySelector('.chatx-layout');
  const thread=container.querySelector('.chat-thread');
  expect(layout).not.toHaveClass('sidebar-collapsed');
  fireEvent.click(screen.getByRole('button',{name:'Recolher navegação de conversas'}));
  expect(layout).toHaveClass('sidebar-collapsed');
  expect(thread).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Expandir navegação de conversas'})).toHaveAttribute('aria-expanded','false');
});
it('permite recarregar os projetos após falha sem apagar a pergunta',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(askQuestion).mockResolvedValue({conversa_id:'conversation-a',resposta:'Resposta após reconectar',fontes:[],origem:'assistente'});
  render(<ChatView/>);
  const retry=await screen.findByRole('button',{name:'Recarregar projetos'});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Pergunta preservada na reconexão'}});
  fireEvent.click(retry);
  await screen.findByRole('option',{name:'Projeto A'});
  expect(screen.getByRole('textbox')).toHaveValue('Pergunta preservada na reconexão');
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await screen.findByText('Resposta após reconectar');
});
it('mantém a nova tentativa disponível se a consulta dos projetos continuar falhando',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockRejectedValue(new Error('offline'));
  render(<ChatView/>);
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Pergunta em edição'}});
  fireEvent.click(await screen.findByRole('button',{name:'Recarregar projetos'}));
  expect(await screen.findByRole('button',{name:'Recarregar projetos'})).toBeEnabled();
  expect(listChatProjects).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('textbox')).toHaveValue('Pergunta em edição');
  expect(askQuestion).not.toHaveBeenCalled();
});
it('distingue ausência de projetos de falha de conexão',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  render(<ChatView/>);
  await screen.findAllByText('Nenhum projeto disponível para consulta.');
  expect(screen.queryByRole('button',{name:'Recarregar projetos'})).toBeNull();
  expect(screen.getByRole('button',{name:'Enviar'})).toBeDisabled();
});
it('abre no escopo de todos os projetos permitidos e envia sem selecionar um projeto',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'},{id:'project-b',nome:'Projeto B'}]);
  vi.mocked(askQuestion).mockResolvedValue({conversa_id:'conversation-general',escopo_tipo:'todos_autorizados',resposta:'Resposta geral',fontes:[],origem:'assistente'});
  render(<ChatView/>);
  const scope=await screen.findByLabelText('Escopo da consulta');
  expect(scope).toHaveValue('todos_autorizados');
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Consultar todos os projetos'}});
  expect(screen.getByRole('button',{name:'Enviar'})).toBeEnabled();
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await waitFor(()=>expect(askQuestion).toHaveBeenCalledWith(expect.objectContaining({
    pergunta:'Consultar todos os projetos',conversaId:null,projetoId:null,escopo:'todos_autorizados',
  }),expect.any(AbortSignal),expect.any(Function),expect.any(Function)));
});
it('informa quando o projeto selecionado ainda não tem conteúdo indexado sem bloquear o chat',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{
    id:'project-empty',nome:'Projeto vazio',documentos_total:0,documentos_processados:0,
    documentos_pendentes:0,documentos_com_falha:0,trechos_elegiveis:0,trechos_com_embedding:0,
    ultimo_trecho_em:null,prontidao:'empty',
  }]);
  render(<ChatView/>);
  fireEvent.change(await screen.findByLabelText('Escopo da consulta'),{target:{value:'projeto:project-empty'}});
  expect(screen.getByRole('option',{name:'Projeto vazio — sem conteúdo indexado'})).toBeInTheDocument();
  expect(screen.getByText(/Ainda não há conteúdo indexado para consulta neste projeto/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Pergunta para tentar responder'}});
  expect(screen.getByRole('button',{name:'Enviar'})).toBeEnabled();
});
it('avisa sobre projetos com acervo incompleto no escopo geral e mantém a consulta disponível',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([
    {id:'project-ready',nome:'Projeto pronto',prontidao:'ready'},
    {id:'project-empty',nome:'Projeto sem acervo',prontidao:'empty'},
  ]);
  render(<ChatView/>);
  expect(await screen.findByText(/Acervo vazio ou incompleto em: Projeto sem acervo/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Consultar tudo que estiver disponível'}});
  expect(screen.getByRole('button',{name:'Enviar'})).toBeEnabled();
});
it('orienta a escolher um projeto antes de enviar e mostra o limite de caracteres',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  render(<ChatView/>);
  await screen.findAllByText('Nenhum projeto disponível para consulta.');
  expect(screen.getByText('0/2000')).toBeInTheDocument();
  const send=screen.getByRole('button',{name:'Enviar'});
  expect(send).toBeDisabled();
  expect(send).toHaveClass('ds-button--ghost');
  expect(send.textContent).toBe('');
});
it('destaca a seta com texto sem fundo e mantém o envio bloqueado sem projeto',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  render(<ChatView/>);
  const field=screen.getByRole('textbox');
  const send=screen.getByRole('button',{name:'Enviar'});
  fireEvent.change(field,{target:{value:'Mensagem pronta'}});
  expect(send).toHaveClass('has-message');
  expect(send).toBeDisabled();
  expect(send.textContent).toBe('');
});
it('ajusta a altura do campo até o limite e habilita rolagem para textos longos',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  render(<ChatView/>);
  const field=screen.getByRole('textbox');
  Object.defineProperty(field,'scrollHeight',{configurable:true,value:120});
  fireEvent.change(field,{target:{value:'Mensagem com duas linhas'}});
  await waitFor(()=>expect(field).toHaveStyle({height:'120px'}));
  Object.defineProperty(field,'scrollHeight',{configurable:true,value:240});
  fireEvent.change(field,{target:{value:'Mensagem muito longa '.repeat(30)}});
  await waitFor(()=>expect(field).toHaveStyle({height:'180px',overflowY:'auto'}));
});
it('converte ditado em português em texto editável e permite encerrar a gravação',async()=>{
  vi.stubGlobal('SpeechRecognition',FakeSpeechRecognition);
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  render(<ChatView/>);
  const field=screen.getByRole('textbox');
  fireEvent.change(field,{target:{value:'Pergunta inicial'}});
  const microphone=screen.getByRole('button',{name:'Iniciar ditado por voz'});
  expect(microphone).toHaveClass('ds-button--ghost');
  expect(microphone.querySelector('svg')).toBeInTheDocument();
  fireEvent.click(microphone);
  const recognition=speechInstances[0];
  expect(recognition.lang).toBe('pt-BR');
  expect(recognition.start).toHaveBeenCalledOnce();
  expect(screen.getByText('Solicitando acesso ao microfone…')).toBeInTheDocument();
  act(()=>recognition.onstart?.());
  expect(screen.getByText(/Ouvindo… fale com naturalidade/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Parar ditado por voz'})).toHaveAttribute('aria-pressed','true');
  act(()=>recognition.onresult?.({results:[{isFinal:true,0:{transcript:'Quais decisões foram tomadas?'}}]}));
  expect(field).toHaveValue('Pergunta inicial Quais decisões foram tomadas?');
  fireEvent.click(screen.getByRole('button',{name:'Parar ditado por voz'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Iniciar ditado por voz'})).toHaveAttribute('aria-pressed','false'));
  expect(recognition.stop).toHaveBeenCalledOnce();
  expect(field).toHaveValue('Pergunta inicial Quais decisões foram tomadas?');
});
it('avisa quando o usuário conclui o ditado sem fala reconhecida',async()=>{
  vi.stubGlobal('SpeechRecognition',FakeSpeechRecognition);
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  render(<ChatView/>);
  fireEvent.click(screen.getByRole('button',{name:'Iniciar ditado por voz'}));
  const recognition=speechInstances[0];
  act(()=>recognition.onstart?.());
  fireEvent.click(screen.getByRole('button',{name:'Parar ditado por voz'}));
  expect(await screen.findByText('Não detectei fala. Toque no microfone para tentar novamente.')).toBeInTheDocument();
});
it('encerra o ditado antes de aceitar uma edição manual para não sobrescrever o texto',async()=>{
  vi.stubGlobal('SpeechRecognition',FakeSpeechRecognition);
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  render(<ChatView/>);
  fireEvent.click(screen.getByRole('button',{name:'Iniciar ditado por voz'}));
  const recognition=speechInstances[0];
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Texto editado manualmente'}});
  expect(recognition.abort).toHaveBeenCalledOnce();
  expect(recognition.onresult).toBeNull();
  expect(screen.getByRole('textbox')).toHaveValue('Texto editado manualmente');
  expect(screen.getByRole('button',{name:'Iniciar ditado por voz'})).toHaveAttribute('aria-pressed','false');
});
it('mostra erro de permissão do microfone com estado visual de erro',async()=>{
  vi.stubGlobal('SpeechRecognition',FakeSpeechRecognition);
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  render(<ChatView/>);
  fireEvent.click(screen.getByRole('button',{name:'Iniciar ditado por voz'}));
  act(()=>speechInstances[0].onerror?.({error:'not-allowed'}));
  expect(await screen.findByText('Permita o acesso ao microfone nas configurações do navegador para ditar.')).toBeInTheDocument();
  expect(screen.getByText('Permita o acesso ao microfone nas configurações do navegador para ditar.').closest('.chat-composer-help')).toHaveClass('is-voice-error');
});
it('explica quando o serviço de transcrição do navegador falha por conexão',async()=>{
  vi.stubGlobal('SpeechRecognition',FakeSpeechRecognition);
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  render(<ChatView/>);
  fireEvent.click(screen.getByRole('button',{name:'Iniciar ditado por voz'}));
  act(()=>speechInstances[0].onerror?.({error:'network'}));
  expect(await screen.findByText(/O navegador não conseguiu acessar o serviço de transcrição/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Iniciar ditado por voz'})).toHaveAttribute('aria-pressed','false');
});
it('explica quando não há um microfone disponível para a transcrição',async()=>{
  vi.stubGlobal('SpeechRecognition',FakeSpeechRecognition);
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  render(<ChatView/>);
  fireEvent.click(screen.getByRole('button',{name:'Iniciar ditado por voz'}));
  act(()=>speechInstances[0].onerror?.({error:'audio-capture'}));
  expect(await screen.findByText(/Não foi possível acessar o microfone/)).toBeInTheDocument();
});
it('permite reiniciar o ditado depois de uma falha do serviço de voz',async()=>{
  vi.stubGlobal('SpeechRecognition',FakeSpeechRecognition);
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  render(<ChatView/>);
  fireEvent.click(screen.getByRole('button',{name:'Iniciar ditado por voz'}));
  act(()=>speechInstances[0].onerror?.({error:'network'}));
  expect(await screen.findByText(/O navegador não conseguiu acessar o serviço de transcrição/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Iniciar ditado por voz'}));
  expect(speechInstances).toHaveLength(2);
  expect(speechInstances[1].start).toHaveBeenCalledOnce();
});
it('encerra a captura de voz ao iniciar uma nova conversa',async()=>{
  vi.stubGlobal('SpeechRecognition',FakeSpeechRecognition);
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  render(<ChatView/>);
  fireEvent.click(screen.getByRole('button',{name:'Iniciar ditado por voz'}));
  const recognition=speechInstances[0];
  fireEvent.click(screen.getByRole('button',{name:'Nova conversa'}));
  expect(recognition.abort).toHaveBeenCalledOnce();
  expect(recognition.onresult).toBeNull();
  expect(screen.getByRole('button',{name:'Iniciar ditado por voz'})).toHaveAttribute('aria-pressed','false');
});
it('explica quando ditado por voz não é suportado pelo navegador',async()=>{
  vi.stubGlobal('SpeechRecognition',undefined);
  vi.stubGlobal('webkitSpeechRecognition',undefined);
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([]);
  render(<ChatView/>);
  fireEvent.click(screen.getByRole('button',{name:'Ditado por voz indisponível'}));
  expect(await screen.findByText('Ditado por voz indisponível neste navegador.')).toBeInTheDocument();
});
it('mantém perguntas sugeridas acima do chat e só preenche o campo ao selecionar',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto Aurora'}]);
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto Aurora'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  const prompt=screen.getByRole('button',{name:'Usar pergunta sugerida: Quais decisões já foram tomadas neste projeto?'});
  expect(prompt).toBeInTheDocument();
  expect(screen.getByLabelText('Perguntas sugeridas').compareDocumentPosition(screen.getByRole('textbox')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(prompt);
  expect(screen.getByRole('textbox')).toHaveValue('Quais decisões já foram tomadas neste projeto?');
  expect(askQuestion).not.toHaveBeenCalled();
});
it('atualiza as sugestões para o assunto da conversa após uma resposta com evidência',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto Aurora'}]);
  vi.mocked(askQuestion).mockResolvedValue({conversa_id:'conversation-a',resposta:'O projeto usa PostgreSQL.',fontes:[],origem:'assistente'});
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto Aurora'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Qual banco estamos usando?'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await screen.findByText('O projeto usa PostgreSQL.');
  expect(screen.getByRole('button',{name:'Usar pergunta sugerida: Quais decisões sobre banco de dados estão registradas?'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Usar pergunta sugerida: Qual é o SLA para solicitação urgente?'})).toBeNull();
});
it('oferece caminhos alternativos quando a pergunta do assunto atual não encontra evidências',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto Aurora'}]);
  vi.mocked(askQuestion).mockResolvedValue({conversa_id:'conversation-a',resposta:'Informação não encontrada no acervo do projeto.',fontes:[],origem:'sem_resultado'});
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto Aurora'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Qual banco estamos usando?'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await screen.findByText('Informação não encontrada no acervo do projeto.');
  expect(screen.getByRole('button',{name:'Usar pergunta sugerida: Há registro de PostgreSQL, MySQL ou outro banco de dados?'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Usar pergunta sugerida: Quais decisões técnicas estão documentadas?'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Usar pergunta sugerida: Qual é o SLA para solicitação urgente?'})).toBeNull();
});
it('usa Enter para enviar e Shift+Enter para manter a quebra de linha',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(askQuestion).mockResolvedValue({conversa_id:'conversation-a',resposta:'Resposta enviada',fontes:[],origem:'assistente'});
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto A'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  const field=screen.getByRole('textbox');
  fireEvent.change(field,{target:{value:'Pergunta por Enter'}});
  field.focus();
  fireEvent.keyDown(field,{key:'Enter',shiftKey:true});
  expect(askQuestion).not.toHaveBeenCalled();
  expect(field).toHaveValue('Pergunta por Enter');
  fireEvent.keyDown(field,{key:'Enter',shiftKey:false});
  await screen.findByText('Resposta enviada');
  expect(askQuestion).toHaveBeenCalledTimes(1);
  await waitFor(()=>expect(field).toHaveFocus());
});
it('devolve o foco ao campo depois do envio pelo botão',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(askQuestion).mockResolvedValue({conversa_id:'conversation-a',resposta:'Resposta concluída',fontes:[],origem:'assistente'});
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto A'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Pergunta enviada pelo botão'}});
  const field=screen.getByRole('textbox');
  const submit=screen.getByRole('button',{name:'Enviar'});
  submit.focus();
  fireEvent.click(submit);
  await screen.findByText('Resposta concluída');
  await waitFor(()=>expect(field).toHaveFocus());
});
it('exibe status animado e alterna as mensagens enquanto aguarda o assistente',async()=>{
  let finish!:(answer:ChatAnswer)=>void;
  let onProgress!:(stage:ChatProgressStage)=>void;
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(askQuestion).mockImplementation((_input,_signal,progress)=>{
    onProgress=progress!;
    return new Promise(resolve=>{finish=resolve;});
  });
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto A'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Pergunta de teste'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  const status=screen.getByRole('status',{name:'O assistente está preparando uma resposta'});
  const statusText=()=>status.querySelector('.chat-typing-message')?.textContent;
  expect(statusText()).toBe('Interpretando sua pergunta e buscando evidências');
  expect(status.querySelectorAll('.chat-typing-dots i')).toHaveLength(3);
  act(()=>onProgress('synthesizing'));
  expect(statusText()).toBe('Preparando uma resposta com base nos registros');
  act(()=>onProgress('validating'));
  expect(statusText()).toBe('Validando evidências e fontes');
  await act(async()=>finish({conversa_id:'conversation-a',resposta:'Resposta pronta',fontes:[],origem:'assistente'}));
  expect(await screen.findByText('Resposta pronta')).toBeInTheDocument();
});
it('ao reabrir uma conversa, permite tentar novamente a última pergunta que falhou',async()=>{
  vi.mocked(listConversations).mockResolvedValue([{id:'conversation-a',titulo:'Conversa A',projeto_id:'project-a',projeto_nome:'Projeto A',escopo_tipo:'projeto',updated_at:''}]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listMessages).mockResolvedValue([
    {id:'old-failed',remetente:'user',conteudo:'Pergunta antiga',fontes:[],created_at:null,failed:true},
    {id:'latest-failed',remetente:'user',conteudo:'Última pergunta',fontes:[],created_at:null,failed:true},
  ]);
  vi.mocked(askQuestion).mockResolvedValue({conversa_id:'conversation-a',resposta:'Resposta da última pergunta',fontes:[],origem:'assistente'});
  render(<ChatView/>);
  const retry=await screen.findByRole('button',{name:'Tentar novamente'});
  expect(retry.closest('.chat-message')).toHaveTextContent('Não enviada');
  expect(retry.closest('[role="alert"]')).toHaveTextContent('consulta anterior não foi concluída');
  fireEvent.click(retry);
  await screen.findByText('Resposta da última pergunta');
  expect(askQuestion).toHaveBeenCalledWith(expect.objectContaining({pergunta:'Última pergunta',conversaId:'conversation-a',projetoId:null,mensagemId:'latest-failed'}),expect.any(AbortSignal),expect.any(Function),expect.any(Function));
});
it('informa quando uma resposta não encontrou evidências no acervo',async()=>{
  vi.mocked(listConversations).mockResolvedValue([{id:'conversation-a',titulo:'Conversa A',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listMessages).mockResolvedValue([{id:'answer',remetente:'assistant',conteudo:'Informação não encontrada no acervo do projeto.',fontes:[],created_at:null,origem:'sem_resultado'}]);
  render(<ChatView/>);
  await screen.findByText('Informação não encontrada no acervo do projeto.');
  expect(screen.getByText('Nenhuma evidência correspondente encontrada no acervo.')).toBeInTheDocument();
});
it('anuncia falha ao copiar uma resposta',async()=>{
  vi.mocked(listConversations).mockResolvedValue([{id:'conversation-a',titulo:'Conversa A',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listMessages).mockResolvedValue([{id:'answer',remetente:'assistant',conteudo:'Resposta para copiar',fontes:[],created_at:null}]);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockRejectedValue(new Error('clipboard denied'))}});
  render(<ChatView/>);
  await screen.findByText('Resposta para copiar');
  fireEvent.click(screen.getByRole('button',{name:'Copiar resposta'}));
  expect(await screen.findByText('Não foi possível copiar a mensagem.')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Não foi possível copiar a resposta'})).toBeInTheDocument();
});
it('apaga uma mensagem após confirmação e atualiza a conversa sem recarregá-la',async()=>{
  vi.mocked(listConversations).mockResolvedValue([{id:'conversation-a',titulo:'Conversa A',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listMessages).mockResolvedValue([
    {id:'user-message',remetente:'user',conteudo:'Pergunta original',fontes:[],created_at:null},
    {id:'assistant-message',remetente:'assistant',conteudo:'Resposta original',fontes:[],created_at:null},
  ]);
  vi.mocked(deleteMessage).mockResolvedValue();
  render(<ChatView/>);
  await screen.findByText('Resposta original');
  expect(screen.queryByRole('button',{name:/Apagar mensagem:/})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Mais ações: Ações da mensagem de Assistente Sinapse'}));
  fireEvent.click(within(screen.getByRole('menu',{name:'Ações da mensagem de Assistente Sinapse'})).getByRole('menuitem',{name:'Apagar resposta'}));
  const confirmation=screen.getByRole('group',{name:'Confirmar exclusão da mensagem'});
  expect(confirmation).toHaveTextContent('Apagar somente esta mensagem? A outra mensagem da conversa continuará no histórico.');
  fireEvent.click(within(confirmation).getByRole('button',{name:'Apagar'}));
  await waitFor(()=>expect(deleteMessage).toHaveBeenCalledWith('conversation-a','assistant-message'));
  await waitFor(()=>expect(screen.queryByText('Resposta original')).toBeNull());
  expect(screen.getByText('Pergunta original')).toBeInTheDocument();
});
it('não apaga a mensagem se o usuário cancelar a confirmação',async()=>{
  vi.mocked(listConversations).mockResolvedValue([{id:'conversation-a',titulo:'Conversa A',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listMessages).mockResolvedValue([{id:'user-message',remetente:'user',conteudo:'Pergunta original',fontes:[],created_at:null}]);
  render(<ChatView/>);
  await screen.findByText('Pergunta original');
  fireEvent.click(screen.getByRole('button',{name:'Mais ações: Ações da mensagem de Você'}));
  fireEvent.click(within(screen.getByRole('menu',{name:'Ações da mensagem de Você'})).getByRole('menuitem',{name:'Apagar pergunta'}));
  const confirmation=screen.getByRole('group',{name:'Confirmar exclusão da mensagem'});
  fireEvent.click(within(confirmation).getByRole('button',{name:'Cancelar'}));
  expect(deleteMessage).not.toHaveBeenCalled();
  expect(screen.getByText('Pergunta original')).toBeInTheDocument();
});
it('abre ações da mensagem pelo botão acessível e copia o texto escolhido',async()=>{
  vi.mocked(listConversations).mockResolvedValue([{id:'conversation-a',titulo:'Conversa A',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listMessages).mockResolvedValue([{id:'answer',remetente:'assistant',conteudo:'Resposta contextual',fontes:[],created_at:null}]);
  const writeText=vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
  render(<ChatView/>);
  await screen.findByText('Resposta contextual');
  fireEvent.click(screen.getByRole('button',{name:'Mais ações: Ações da mensagem de Assistente Sinapse'}));
  const menu=screen.getByRole('menu',{name:'Ações da mensagem de Assistente Sinapse'});
  fireEvent.click(within(menu).getByRole('menuitem',{name:'Copiar resposta'}));
  await waitFor(()=>expect(writeText).toHaveBeenCalledWith('Resposta contextual'));
  expect(await screen.findByText('Mensagem copiada.')).toBeInTheDocument();
  expect(screen.queryByRole('menu')).toBeNull();
});
it('abre o menu por clique direito e por Shift+F10 e fecha com Escape devolvendo o foco',async()=>{
  vi.mocked(listConversations).mockResolvedValue([{id:'conversation-a',titulo:'Conversa A',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listMessages).mockResolvedValue([{id:'answer',remetente:'assistant',conteudo:'Mensagem para ações',fontes:[],created_at:null}]);
  render(<ChatView/>);
  const text=await screen.findByText('Mensagem para ações');
  const article=text.closest('article');
  expect(article).not.toBeNull();
  fireEvent.contextMenu(article!,{clientX:35,clientY:45});
  expect(screen.getByRole('menu',{name:'Ações da mensagem de Assistente Sinapse'})).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('menu'),{key:'Escape'});
  await waitFor(()=>expect(screen.queryByRole('menu')).toBeNull());
  const copy=screen.getByRole('button',{name:'Copiar resposta'});
  copy.focus();
  fireEvent.keyDown(copy,{key:'F10',shiftKey:true});
  const menu=screen.getByRole('menu',{name:'Ações da mensagem de Assistente Sinapse'});
  fireEvent.keyDown(menu,{key:'Escape'});
  await waitFor(()=>expect(screen.queryByRole('menu')).toBeNull());
  await waitFor(()=>expect(screen.getByRole('button',{name:'Mais ações: Ações da mensagem de Assistente Sinapse'})).toHaveFocus());
});
it('mantém o menu nativo em links e oferece acesso direto às fontes',async()=>{
  vi.mocked(listConversations).mockResolvedValue([{id:'conversation-a',titulo:'Conversa A',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listMessages).mockResolvedValue([{id:'answer',remetente:'assistant',conteudo:'Resposta com evidência',fontes:[{id:'source-a',tipo:'documento',titulo:'Documento de referência',url:'/documento'}],created_at:null}]);
  render(<ChatView/>);
  const link=await screen.findByRole('link',{name:'Documento de referência'});
  fireEvent.contextMenu(link,{clientX:40,clientY:50});
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Mais ações: Ações da mensagem de Assistente Sinapse'}));
  const menu=screen.getByRole('menu',{name:'Ações da mensagem de Assistente Sinapse'});
  fireEvent.click(within(menu).getByRole('menuitem',{name:'Ver fontes e evidências'}));
  expect(screen.getByText('Documento de referência')).toBeVisible();
  expect(screen.getByText('Documento de referência').closest('details')).toHaveAttribute('open');
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Mais ações: Ações da mensagem de Assistente Sinapse'}));
  expect(screen.queryByRole('menuitem',{name:'Ver fontes e evidências'})).toBeNull();
});
it('mantém nome e horário completo na mesma linha em todas as mensagens',async()=>{
  vi.mocked(listConversations).mockResolvedValue([{id:'conversation-a',titulo:'Conversa A',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listMessages).mockResolvedValue([
    {id:'question',remetente:'user',conteudo:'Pergunta com horário',fontes:[],created_at:'2026-10-27T03:04:05.000Z'},
    {id:'answer',remetente:'assistant',conteudo:'Resposta com horário',fontes:[],created_at:'2026-10-27T03:04:06.000Z'},
  ]);
  render(<ChatView/>);
  const question=await screen.findByText('Pergunta com horário');
  const userArticle=question.closest('article');
  const userHeader=userArticle?.querySelector('header');
  const userTime=userHeader?.querySelector('time');
  expect(userTime?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  expect(userTime?.previousElementSibling?.tagName).toBe('B');
  expect(userArticle?.parentElement?.querySelector('button[aria-label^="Mais ações"]')).not.toBeNull();
  const message=await screen.findByText('Resposta com horário');
  const article=message.closest('article');
  const time=article?.querySelector('time');
  expect(time).not.toBeNull();
  expect(time?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  expect(time?.previousElementSibling?.tagName).toBe('B');
  expect(time).toHaveAttribute('title',expect.stringMatching(/\d{2}:\d{2}:\d{2}/));
});
it('o menu de uma mensagem falha só oferece retry quando ela é a última pergunta elegível',async()=>{
  vi.mocked(listConversations).mockResolvedValue([{id:'conversation-a',titulo:'Conversa A',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listMessages).mockResolvedValue([
    {id:'failed',remetente:'user',conteudo:'Pergunta pendente de nova tentativa',fontes:[],created_at:null,failed:true},
  ]);
  vi.mocked(askQuestion).mockResolvedValue({conversa_id:'conversation-a',resposta:'Resposta recuperada',fontes:[],origem:'assistente'});
  render(<ChatView/>);
  await screen.findByText('Pergunta pendente de nova tentativa');
  fireEvent.click(screen.getByRole('button',{name:'Mais ações: Ações da mensagem de Você'}));
  const menu=screen.getByRole('menu',{name:'Ações da mensagem de Você'});
  fireEvent.click(within(menu).getByRole('menuitem',{name:'Tentar novamente'}));
  await screen.findByText('Resposta recuperada');
  expect(askQuestion).toHaveBeenCalledWith(expect.objectContaining({pergunta:'Pergunta pendente de nova tentativa',conversaId:'conversation-a',projetoId:null,mensagemId:'failed'}),expect.any(AbortSignal),expect.any(Function),expect.any(Function));
});
it('não oferece novamente uma falha antiga quando a conversa já teve resposta',async()=>{
  vi.mocked(listConversations).mockResolvedValue([{id:'conversation-a',titulo:'Conversa A',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listMessages).mockResolvedValue([
    {id:'old-failed',remetente:'user',conteudo:'Pergunta antiga',fontes:[],created_at:null,failed:true},
    {id:'answer',remetente:'assistant',conteudo:'Resposta já concluída',fontes:[],created_at:null},
  ]);
  render(<ChatView/>);
  await screen.findByText('Resposta já concluída');
  expect(screen.queryByRole('button',{name:'Tentar novamente'})).toBeNull();
});
it('mantém a pergunta no campo quando o assistente está indisponível',async()=>{
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(askQuestion).mockRejectedValue(new Error('offline'));
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto A'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  const field=screen.getByRole('textbox');fireEvent.change(field,{target:{value:'Como funciona o login?'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await screen.findByText('Assistente indisponível');expect(field).toHaveValue('Como funciona o login?');
});
it('reconcilia conflito com pergunta em andamento sem marcar como não enviada',async()=>{
  vi.mocked(listConversations).mockResolvedValue([{id:'conversation-a',titulo:'Conversa A',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listMessages).mockResolvedValueOnce([]).mockResolvedValueOnce([
    {id:'pending-question',remetente:'user',conteudo:'banco',fontes:[],created_at:null,processing:true},
  ]);
  vi.mocked(askQuestion).mockRejectedValue(new ApiError(409,{error:'Aguarde a resposta em andamento nesta conversa.'}));
  render(<ChatView/>);
  await screen.findByRole('heading',{name:'Conversa A'});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'banco'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  expect(await screen.findByText('Em processamento')).toBeInTheDocument();
  expect(screen.queryByText('Não enviada')).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent('Esta pergunta já está sendo processada');
});
it('enfileira novas perguntas em ordem e as envia uma por vez',async()=>{
  let finishFirst!:(answer:ChatAnswer)=>void;
  let finishSecond!:(answer:ChatAnswer)=>void;
  let finishThird!:(answer:ChatAnswer)=>void;
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(askQuestion)
    .mockImplementationOnce(()=>new Promise(resolve=>{finishFirst=resolve;}))
    .mockImplementationOnce(()=>new Promise(resolve=>{finishSecond=resolve;}))
    .mockImplementationOnce(()=>new Promise(resolve=>{finishThird=resolve;}));
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto A'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  const field=screen.getByRole('textbox');
  fireEvent.change(field,{target:{value:'Primeira pergunta'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await waitFor(()=>expect(askQuestion).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button',{name:'Interromper consulta'})).toBeInTheDocument();
  fireEvent.change(field,{target:{value:'Segunda pergunta'}});
  fireEvent.keyDown(field,{key:'Enter',code:'Enter',charCode:13});
  const queue=screen.getByRole('region',{name:'Fila de mensagens'});
  expect(within(queue).getByText('Segunda pergunta')).toBeInTheDocument();
  expect(within(queue).getByLabelText('Posição 1')).toBeInTheDocument();
  fireEvent.change(field,{target:{value:'Terceira pergunta'}});
  fireEvent.keyDown(field,{key:'Enter',code:'Enter',charCode:13});
  expect(within(queue).getByText('Terceira pergunta')).toBeInTheDocument();
  expect(within(queue).getByLabelText('Posição 2')).toBeInTheDocument();
  expect(askQuestion).toHaveBeenCalledTimes(1);
  await act(async()=>finishFirst({conversa_id:'conversation-a',resposta:'Resposta 1',fontes:[],origem:'assistente'}));
  await waitFor(()=>expect(askQuestion).toHaveBeenCalledTimes(2));
  expect(vi.mocked(askQuestion).mock.calls[1][0]).toMatchObject({pergunta:'Segunda pergunta',conversaId:'conversation-a'});
  await act(async()=>finishSecond({conversa_id:'conversation-a',resposta:'Resposta 2',fontes:[],origem:'assistente'}));
  await waitFor(()=>expect(askQuestion).toHaveBeenCalledTimes(3));
  expect(vi.mocked(askQuestion).mock.calls[2][0]).toMatchObject({pergunta:'Terceira pergunta',conversaId:'conversation-a'});
  await act(async()=>finishThird({conversa_id:'conversation-a',resposta:'Resposta 3',fontes:[],origem:'assistente'}));
  expect(await screen.findByText('Resposta 3')).toBeInTheDocument();
});
it('o botão de interromper cancela a consulta ativa e mantém retry disponível',async()=>{
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(askQuestion).mockImplementation((_input,signal)=>new Promise((_resolve,reject)=>{
    signal?.addEventListener('abort',()=>reject(new DOMException('Consulta interrompida','AbortError')),{once:true});
  }));
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto A'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Pergunta longa'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  fireEvent.click(await screen.findByRole('button',{name:'Interromper consulta'}));
  expect(await screen.findByText('Consulta interrompida. A pergunta ficou disponível para nova tentativa; a fila aguardará.')).toBeInTheDocument();
  expect(await screen.findByRole('button',{name:'Tentar novamente'})).toBeInTheDocument();
});
it('mostra a fila separada do histórico e permite remover uma pergunta antes de enviá-la',async()=>{
  let finish!:(answer:ChatAnswer)=>void;
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(askQuestion).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto A'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  const field=screen.getByRole('textbox');
  fireEvent.change(field,{target:{value:'Pergunta ativa'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await waitFor(()=>expect(askQuestion).toHaveBeenCalledTimes(1));
  fireEvent.change(field,{target:{value:'Pergunta que será removida'}});
  fireEvent.keyDown(field,{key:'Enter',code:'Enter',charCode:13});
  const queue=screen.getByRole('region',{name:'Fila de mensagens'});
  expect(within(queue).getByText('Pergunta que será removida')).toBeInTheDocument();
  expect(within(queue).getByRole('listitem')).toHaveTextContent('1');
  fireEvent.click(within(queue).getByRole('button',{name:'Remover pergunta 1 da fila'}));
  await waitFor(()=>expect(screen.queryByRole('region',{name:'Fila de mensagens'})).toBeNull());
  expect(screen.queryByText('Pergunta que será removida')).toBeNull();
  expect(askQuestion).toHaveBeenCalledTimes(1);
  await act(async()=>finish({conversa_id:'conversation-a',resposta:'Concluída',fontes:[],origem:'assistente'}));
  await screen.findByText('Concluída');
  expect(askQuestion).toHaveBeenCalledTimes(1);
});
it('limpa apenas as mensagens aguardando e mantém a consulta atual',async()=>{
  let finish!:(answer:ChatAnswer)=>void;
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(askQuestion).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto A'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  const field=screen.getByRole('textbox');
  fireEvent.change(field,{target:{value:'Pergunta ativa'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await waitFor(()=>expect(askQuestion).toHaveBeenCalledTimes(1));
  fireEvent.change(field,{target:{value:'Pergunta pendente'}});
  fireEvent.keyDown(field,{key:'Enter',code:'Enter',charCode:13});
  const queue=screen.getByRole('region',{name:'Fila de mensagens'});
  fireEvent.click(within(queue).getByRole('button',{name:'Limpar fila'}));
  expect(screen.queryByRole('region',{name:'Fila de mensagens'})).toBeNull();
  expect(askQuestion).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button',{name:'Interromper consulta'})).toBeInTheDocument();
  await act(async()=>finish({conversa_id:'conversation-a',resposta:'Resposta atual',fontes:[],origem:'assistente'}));
  await screen.findByText('Resposta atual');
  expect(askQuestion).toHaveBeenCalledTimes(1);
});
it.each(['digitação','sugestão'])('não abre conversa antiga quando a primeira interação é %s, antes de escolher o projeto',async interaction=>{
  let finish!:(items:ChatConversation[])=>void;
  vi.mocked(listConversations).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-b',nome:'Projeto B'}]);
  render(<ChatView/>);
  const text=interaction==='digitação'?'Pergunta sem projeto escolhido':'Quais decisões já foram tomadas neste projeto?';
  if(interaction==='digitação')fireEvent.change(screen.getByRole('textbox'),{target:{value:text}});
  else fireEvent.click(screen.getByRole('button',{name:`Usar pergunta sugerida: ${text}`}));
  await act(async()=>finish([{id:'old-b',titulo:'Conversa B',projeto_id:'project-b',projeto_nome:'Projeto B',updated_at:''}]));
  expect(screen.getByLabelText('Escopo da consulta')).toBeEnabled();
  expect(screen.getByLabelText('Escopo da consulta')).toHaveValue('todos_autorizados');
  expect(screen.getByRole('textbox')).toHaveValue(text);
  expect(listMessages).not.toHaveBeenCalled();
});
it('não substitui o histórico atualizado por uma consulta anterior que terminou depois',async()=>{
  let finish!:(items:ChatConversation[])=>void;
  vi.mocked(listConversations).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValue([{id:'new-a',titulo:'Conversa nova A',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(askQuestion).mockResolvedValue({conversa_id:'new-a',resposta:'Resposta atualizada',fontes:[],origem:'assistente'});
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto A'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Pergunta nova'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await screen.findByRole('heading',{name:'Conversa nova A'});
  await act(async()=>finish([]));
  expect(screen.getByRole('heading',{name:'Conversa nova A'})).toBeInTheDocument();
});
it('uma resposta atrasada do histórico não troca o projeto escolhido para a nova conversa',async()=>{
  let finish!:(items:ChatConversation[])=>void;
  vi.mocked(listConversations).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValue([]);
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'},{id:'project-b',nome:'Projeto B'}]);
  vi.mocked(askQuestion).mockResolvedValue({conversa_id:'new-a',resposta:'Resposta do projeto A',fontes:[],origem:'assistente'});
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto A'});
  const scope=screen.getByLabelText('Escopo da consulta');
  fireEvent.change(scope,{target:{value:'projeto:project-a'}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Como funciona o login?'}});
  await act(async()=>finish([{id:'old-b',titulo:'Conversa do projeto B',projeto_id:'project-b',projeto_nome:'Projeto B',updated_at:''}]));
  expect(scope).toBeEnabled();expect(scope).toHaveValue('projeto:project-a');
  expect(listMessages).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await screen.findByText('Resposta do projeto A');
  expect(askQuestion).toHaveBeenCalledWith(expect.objectContaining({projetoId:'project-a',conversaId:null}),expect.any(AbortSignal),expect.any(Function),expect.any(Function));
});
it('repetir a consulta do histórico também não abre uma conversa sobre a pergunta em edição',async()=>{
  vi.mocked(listConversations).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([{id:'old-b',titulo:'Conversa antiga B',projeto_id:'project-b',projeto_nome:'Projeto B',updated_at:''}]);
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto A'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Pergunta em edição'}});
  fireEvent.click(await screen.findByRole('button',{name:'Tentar novamente'}));
  await screen.findByText('Conversa antiga B');
  expect(screen.getByLabelText('Escopo da consulta')).toBeEnabled();
  expect(screen.getByRole('textbox')).toHaveValue('Pergunta em edição');
  expect(listMessages).not.toHaveBeenCalled();
});
it('mantém a seleção inicial da última conversa quando o usuário ainda não interagiu',async()=>{
  vi.mocked(listConversations).mockResolvedValue([{id:'old-b',titulo:'Última conversa B',projeto_id:'project-b',projeto_nome:'Projeto B',updated_at:''}]);
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-b',nome:'Projeto B'}]);
  render(<ChatView/>);
  await screen.findByRole('heading',{name:'Última conversa B'});
  expect(screen.getByLabelText('Escopo da consulta')).toBeDisabled();
  expect(screen.getByLabelText('Escopo da consulta')).toHaveValue('projeto:project-b');
});
it('aguarda as mensagens antigas antes de permitir envio, sem perder a pergunta digitada',async()=>{
  let finish!:(items:[])=>void;
  vi.mocked(listConversations).mockResolvedValue([{id:'existing-a',titulo:'Conversa A',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listMessages).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(askQuestion).mockResolvedValue({conversa_id:'existing-a',resposta:'Resposta atual',fontes:[],origem:'assistente'});
  render(<ChatView/>);
  await screen.findByText('Carregando mensagens…');
  const field=screen.getByRole('textbox');fireEvent.change(field,{target:{value:'Pergunta que não pode desaparecer'}});
  expect(screen.getByRole('button',{name:'Enviar'})).toBeDisabled();
  fireEvent.submit(screen.getByRole('button',{name:'Enviar'}).closest('form')!);
  expect(askQuestion).not.toHaveBeenCalled();
  await act(async()=>finish([]));
  expect(field).toHaveValue('Pergunta que não pode desaparecer');
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await screen.findByText('Resposta atual');
});
it('não mistura uma resposta atrasada com a nova pergunta de outro projeto',async()=>{
  let finish!:(answer:ChatAnswer)=>void;
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'},{id:'project-b',nome:'Projeto B'}]);
  vi.mocked(askQuestion).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto A'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Pergunta do projeto A'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  fireEvent.click(screen.getByRole('button',{name:'Nova conversa'}));
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-b'}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Pergunta do projeto B'}});
  await act(async()=>finish({conversa_id:'conversation-a',resposta:'Resposta atrasada do projeto A',fontes:[],origem:'assistente'}));
  expect(screen.queryByText('Resposta atrasada do projeto A')).toBeNull();
  expect(screen.getByRole('textbox')).toHaveValue('Pergunta do projeto B');
  expect(screen.getByLabelText('Escopo da consulta')).toHaveValue('projeto:project-b');
});
it.each([
  {draft:'Como funciona o login?',success:true,expected:''},
  {draft:'Outra pergunta em edição',success:true,expected:'Outra pergunta em edição'},
  {draft:'Como funciona o login?',success:false,expected:'Como funciona o login?'},
  {draft:'Outra pergunta em edição',success:false,expected:'Outra pergunta em edição'},
])('preserva corretamente o campo após nova tentativa: %j',async({draft,success,expected})=>{
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listConversations).mockResolvedValue([]);
  vi.mocked(askQuestion).mockRejectedValueOnce(new Error('offline'));
  if(success)vi.mocked(askQuestion).mockResolvedValueOnce({conversa_id:'conversation-a',resposta:'Resposta verificada',fontes:[],origem:'assistente'});
  else vi.mocked(askQuestion).mockRejectedValueOnce(new Error('offline'));
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto A'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'projeto:project-a'}});
  const field=screen.getByRole('textbox');fireEvent.change(field,{target:{value:'Como funciona o login?'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await screen.findByText('Assistente indisponível');
  fireEvent.change(field,{target:{value:draft}});
  fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));
  await screen.findByText(success?'Resposta verificada':'Assistente indisponível');expect(field).toHaveValue(expected);
});

it('permite excluir uma conversa a partir da lista lateral após confirmação',async()=>{
  vi.mocked(deleteConversation).mockResolvedValue(undefined);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listConversations).mockResolvedValue([
    {id:'conv-1',titulo:'Conversa 1',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''},
    {id:'conv-2',titulo:'Conversa 2',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''},
  ]);
  vi.mocked(listMessages).mockResolvedValue([]);
  render(<ChatView/>);
  await screen.findByRole('heading',{name:'Conversa 1'});
  const sidebar=within(document.querySelector('.chat-conversations')!);
  fireEvent.click(sidebar.getByRole('button',{name:'Ações da conversa: Conversa 1'}));
  const menu=screen.getByRole('menu',{name:'Ações da conversa Conversa 1'});
  fireEvent.click(within(menu).getByRole('menuitem',{name:'Excluir conversa'}));
  const confirmation=screen.getByRole('group',{name:'Confirmar exclusão de Conversa 1'});
  expect(document.querySelector('.chat-conversation-delete')).toBeNull();
  expect(confirmation).toHaveTextContent('Excluir “Conversa 1” e todas as mensagens desta conversa permanentemente?');
  expect(deleteConversation).not.toHaveBeenCalled();
  fireEvent.click(within(confirmation).getByRole('button',{name:'Excluir'}));
  expect(deleteConversation).toHaveBeenCalledWith('conv-1');
  await screen.findByText('Conversa 2');
  expect(screen.queryByRole('heading',{name:'Conversa 1'})).toBeNull();
});

it('permite excluir a conversa ativa a partir do cabeçalho e reseta o chat para nova conversa',async()=>{
  vi.mocked(deleteConversation).mockResolvedValue(undefined);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listConversations).mockResolvedValue([
    {id:'conv-active',titulo:'Conversa Ativa',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''},
  ]);
  vi.mocked(listMessages).mockResolvedValue([]);
  render(<ChatView/>);
  await screen.findByRole('heading',{name:'Conversa Ativa'});
  const deleteBtn=screen.getByTitle('Excluir esta conversa');
  expect(deleteBtn).toHaveAccessibleName('Excluir esta conversa');
  expect(deleteBtn).toHaveTextContent('');
  expect(deleteBtn.querySelector('svg')).not.toBeNull();
  fireEvent.click(deleteBtn);
  const confirmation=screen.getByRole('group',{name:'Confirmar exclusão de Conversa Ativa'});
  fireEvent.click(within(confirmation).getByRole('button',{name:'Excluir'}));
  expect(deleteConversation).toHaveBeenCalledWith('conv-active');
  await screen.findByRole('heading',{name:'Nova conversa'});
});

it('não exclui a conversa caso o usuário cancele a confirmação',async()=>{
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listConversations).mockResolvedValue([
    {id:'conv-1',titulo:'Conversa Permanente',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''},
  ]);
  vi.mocked(listMessages).mockResolvedValue([]);
  render(<ChatView/>);
  await screen.findByRole('heading',{name:'Conversa Permanente'});
  const deleteBtn=screen.getByTitle('Excluir esta conversa');
  fireEvent.click(deleteBtn);
  const confirmation=screen.getByRole('group',{name:'Confirmar exclusão de Conversa Permanente'});
  fireEvent.click(within(confirmation).getByRole('button',{name:'Cancelar'}));
  expect(deleteConversation).not.toHaveBeenCalled();
  expect(screen.getByRole('heading',{name:'Conversa Permanente'})).toBeInTheDocument();
});

it('preserva a abertura em um clique e oferece ações na lista e no título ativo',async()=>{
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listConversations).mockResolvedValue([
    {id:'conv-1',titulo:'Conversa Um',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''},
    {id:'conv-2',titulo:'Conversa Dois',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''},
  ]);
  vi.mocked(listMessages).mockResolvedValue([]);
  const writeText=vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
  render(<ChatView/>);
  await screen.findByRole('heading',{name:'Conversa Um'});
  const sidebarActions=within(document.querySelector('.chat-conversations')!).getAllByRole('button',{name:/Ações da conversa: Conversa/});
  expect(sidebarActions).toHaveLength(2);
  fireEvent.contextMenu(screen.getByRole('heading',{name:'Conversa Um'}),{clientX:30,clientY:40});
  const titleMenu=screen.getByRole('menu',{name:'Ações da conversa Conversa Um'});
  expect(titleMenu).toBeInTheDocument();
  fireEvent.keyDown(titleMenu,{key:'Escape'});
  fireEvent.click(screen.getByText('Conversa Dois'));
  await screen.findByRole('heading',{name:'Conversa Dois'});
  const otherSidebarAction=within(document.querySelector('.chat-conversations')!).getByRole('button',{name:'Ações da conversa: Conversa Dois'});
  fireEvent.click(otherSidebarAction);
  const sidebarMenu=screen.getByRole('menu',{name:'Ações da conversa Conversa Dois'});
  fireEvent.click(within(sidebarMenu).getByRole('menuitem',{name:'Copiar título'}));
  await waitFor(()=>expect(writeText).toHaveBeenCalledWith('Conversa Dois'));
  expect(screen.getByRole('heading',{name:'Conversa Dois'})).toBeInTheDocument();
});
it('confirma exclusão pelo menu da conversa, sem confirmação nativa, e devolve o foco ao acionador ao cancelar',async()=>{
  const nativeConfirm=vi.spyOn(window,'confirm');
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listConversations).mockResolvedValue([{id:'conv-1',titulo:'Conversa Segura',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listMessages).mockResolvedValue([]);
  render(<ChatView/>);
  await screen.findByRole('heading',{name:'Conversa Segura'});
  const sidebar=within(document.querySelector('.chat-conversations')!);
  fireEvent.contextMenu(sidebar.getByText('Conversa Segura'),{clientX:20,clientY:30});
  const menu=screen.getByRole('menu',{name:'Ações da conversa Conversa Segura'});
  fireEvent.click(within(menu).getByRole('menuitem',{name:'Excluir conversa'}));
  const confirmation=sidebar.getByRole('group',{name:'Confirmar exclusão de Conversa Segura'});
  const cancel=within(confirmation).getByRole('button',{name:'Cancelar'});
  await waitFor(()=>expect(cancel).toHaveFocus());
  expect(confirmation).toHaveTextContent('e todas as mensagens desta conversa permanentemente?');
  expect(deleteConversation).not.toHaveBeenCalled();
  fireEvent.click(cancel);
  await waitFor(()=>expect(sidebar.getByRole('button',{name:'Ações da conversa: Conversa Segura'})).toHaveFocus());
  expect(nativeConfirm).not.toHaveBeenCalled();
});
it('renomeia pelo menu e atualiza o título no histórico e no cabeçalho',async()=>{
  const conversation={id:'conv-rename',titulo:'Conversa revisada',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:'2026-10-27T12:00:00Z'};
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listConversations).mockResolvedValue([{...conversation,titulo:'Título antigo'}]);
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(renameConversation).mockResolvedValue(conversation);
  render(<ChatView/>);
  await screen.findByRole('heading',{name:'Título antigo'});
  const sidebar=within(document.querySelector('.chat-conversations')!);
  fireEvent.click(sidebar.getByRole('button',{name:'Ações da conversa: Título antigo'}));
  const menu=screen.getByRole('menu',{name:'Ações da conversa Título antigo'});
  fireEvent.click(within(menu).getByRole('menuitem',{name:'Renomear conversa'}));
  const dialog=screen.getByRole('dialog',{name:'Renomear conversa'});
  const input=within(dialog).getByRole('textbox',{name:'Título da conversa'});
  await waitFor(()=>expect(input).toHaveFocus());
  fireEvent.change(input,{target:{value:'Conversa revisada'}});
  fireEvent.click(within(dialog).getByRole('button',{name:'Salvar'}));
  await waitFor(()=>expect(renameConversation).toHaveBeenCalledWith('conv-rename','Conversa revisada'));
  await screen.findByRole('heading',{name:'Conversa revisada'});
  expect(sidebar.getByText('Conversa revisada')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('cancela a renomeação com Escape e restaura foco ao acionador de origem',async()=>{
  const conversation={id:'conv-rename',titulo:'Título original',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''};
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listConversations).mockResolvedValue([conversation]);
  vi.mocked(listMessages).mockResolvedValue([]);
  render(<ChatView/>);
  await screen.findByRole('heading',{name:'Título original'});
  const sidebar=within(document.querySelector('.chat-conversations')!);
  const trigger=sidebar.getByRole('button',{name:'Ações da conversa: Título original'});
  fireEvent.click(trigger);
  fireEvent.click(within(screen.getByRole('menu',{name:'Ações da conversa Título original'})).getByRole('menuitem',{name:'Renomear conversa'}));
  expect(screen.getByRole('dialog',{name:'Renomear conversa'})).toBeInTheDocument();
  fireEvent.keyDown(document,{key:'Escape'});
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(()=>expect(trigger).toHaveFocus());
  expect(renameConversation).not.toHaveBeenCalled();
});
it('mantém o diálogo de renomeação aberto e o título antigo quando a API falha',async()=>{
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listConversations).mockResolvedValue([{id:'conv-rename',titulo:'Título original',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(renameConversation).mockRejectedValue(new Error('offline'));
  render(<ChatView/>);
  await screen.findByRole('heading',{name:'Título original'});
  const sidebar=within(document.querySelector('.chat-conversations')!);
  fireEvent.click(sidebar.getByRole('button',{name:'Ações da conversa: Título original'}));
  fireEvent.click(within(screen.getByRole('menu',{name:'Ações da conversa Título original'})).getByRole('menuitem',{name:'Renomear conversa'}));
  const dialog=screen.getByRole('dialog',{name:'Renomear conversa'});
  fireEvent.change(within(dialog).getByRole('textbox',{name:'Título da conversa'}),{target:{value:'Novo título'}});
  fireEvent.click(within(dialog).getByRole('button',{name:'Salvar'}));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Assistente indisponível');
  expect(within(dialog).getByRole('textbox',{name:'Título da conversa'})).toHaveValue('Novo título');
  expect(screen.getByRole('heading',{name:'Título original'})).toBeInTheDocument();
});
