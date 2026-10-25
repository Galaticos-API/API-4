import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {ChatView} from './ChatView';
import {askQuestion,listChatProjects,listConversations,listMessages,type ChatConversation,type ChatAnswer} from '../../api/api_chat';
vi.mock('../../api/api_chat',()=>({MAX_QUESTION_LENGTH:2000,askQuestion:vi.fn(),listChatProjects:vi.fn(),listConversations:vi.fn(),listMessages:vi.fn(),describeChatError:()=> 'Assistente indisponível'}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
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
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'project-a'}});
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
  await screen.findByText('Nenhum projeto disponível para consulta.');
  expect(screen.queryByRole('button',{name:'Recarregar projetos'})).toBeNull();
  expect(screen.getByRole('button',{name:'Enviar'})).toBeDisabled();
});
it('ao reabrir uma conversa, permite tentar novamente a última pergunta que falhou',async()=>{
  vi.mocked(listConversations).mockResolvedValue([{id:'conversation-a',titulo:'Conversa A',projeto_id:'project-a',projeto_nome:'Projeto A',updated_at:''}]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  vi.mocked(listMessages).mockResolvedValue([
    {id:'old-failed',remetente:'user',conteudo:'Pergunta antiga',fontes:[],created_at:null,failed:true},
    {id:'latest-failed',remetente:'user',conteudo:'Última pergunta',fontes:[],created_at:null,failed:true},
  ]);
  vi.mocked(askQuestion).mockResolvedValue({conversa_id:'conversation-a',resposta:'Resposta da última pergunta',fontes:[],origem:'assistente'});
  render(<ChatView/>);
  fireEvent.click(await screen.findByRole('button',{name:'Tentar novamente'}));
  await screen.findByText('Resposta da última pergunta');
  expect(askQuestion).toHaveBeenCalledWith({pergunta:'Última pergunta',conversaId:'conversation-a',projetoId:null});
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
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'project-a'}});
  const field=screen.getByRole('textbox');fireEvent.change(field,{target:{value:'Como funciona o login?'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await screen.findByText('Assistente indisponível');expect(field).toHaveValue('Como funciona o login?');
});
it.each(['digitação','sugestão'])('não abre conversa antiga quando a primeira interação é %s, antes de escolher o projeto',async interaction=>{
  let finish!:(items:ChatConversation[])=>void;
  vi.mocked(listConversations).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-b',nome:'Projeto B'}]);
  render(<ChatView/>);
  const text=interaction==='digitação'?'Pergunta sem projeto escolhido':'Quais decisões já foram tomadas neste projeto?';
  if(interaction==='digitação')fireEvent.change(screen.getByRole('textbox'),{target:{value:text}});
  else fireEvent.click(screen.getByRole('button',{name:text}));
  await act(async()=>finish([{id:'old-b',titulo:'Conversa B',projeto_id:'project-b',projeto_nome:'Projeto B',updated_at:''}]));
  expect(screen.getByLabelText('Escopo da consulta')).toBeEnabled();
  expect(screen.getByLabelText('Escopo da consulta')).toHaveValue('');
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
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'project-a'}});
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
  fireEvent.change(scope,{target:{value:'project-a'}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Como funciona o login?'}});
  await act(async()=>finish([{id:'old-b',titulo:'Conversa do projeto B',projeto_id:'project-b',projeto_nome:'Projeto B',updated_at:''}]));
  expect(scope).toBeEnabled();expect(scope).toHaveValue('project-a');
  expect(listMessages).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await screen.findByText('Resposta do projeto A');
  expect(askQuestion).toHaveBeenCalledWith(expect.objectContaining({projetoId:'project-a',conversaId:null}));
});
it('repetir a consulta do histórico também não abre uma conversa sobre a pergunta em edição',async()=>{
  vi.mocked(listConversations).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([{id:'old-b',titulo:'Conversa antiga B',projeto_id:'project-b',projeto_nome:'Projeto B',updated_at:''}]);
  vi.mocked(listMessages).mockResolvedValue([]);
  vi.mocked(listChatProjects).mockResolvedValue([{id:'project-a',nome:'Projeto A'}]);
  render(<ChatView/>);
  await screen.findByRole('option',{name:'Projeto A'});
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'project-a'}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Pergunta em edição'}});
  fireEvent.click(await screen.findByRole('button',{name:'Tentar novamente'}));
  await screen.findByRole('button',{name:/Conversa antiga B/});
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
  expect(screen.getByLabelText('Escopo da consulta')).toHaveValue('project-b');
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
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'project-a'}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Pergunta do projeto A'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  fireEvent.click(screen.getByRole('button',{name:'Nova conversa'}));
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'project-b'}});
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Pergunta do projeto B'}});
  await act(async()=>finish({conversa_id:'conversation-a',resposta:'Resposta atrasada do projeto A',fontes:[],origem:'assistente'}));
  expect(screen.queryByText('Resposta atrasada do projeto A')).toBeNull();
  expect(screen.getByRole('textbox')).toHaveValue('Pergunta do projeto B');
  expect(screen.getByLabelText('Escopo da consulta')).toHaveValue('project-b');
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
  fireEvent.change(screen.getByLabelText('Escopo da consulta'),{target:{value:'project-a'}});
  const field=screen.getByRole('textbox');fireEvent.change(field,{target:{value:'Como funciona o login?'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar'}));
  await screen.findByText('Assistente indisponível');
  fireEvent.change(field,{target:{value:draft}});
  fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));
  await screen.findByText(success?'Resposta verificada':'Assistente indisponível');expect(field).toHaveValue(expected);
});
