import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ChatService} from './chat.service.js';
import {ChatRepository} from './chat.repository.js';
import {ragInput} from './rag.service.js';
import {NOT_FOUND_ANSWER} from './chat.types.js';
import {ValidationError} from '../../shared/errors.js';

class RecordingChats extends ChatRepository {
  titles:string[]=[];
  questions:string[]=[];
  retries:Array<{conversation:string;message:string;text:string}>=[];
  async projectExists(){return true;}
  async createConversation(user:string,project:string|null,title:string){
    this.titles.push(title);return {id:randomUUID(),usuario_id:user,projeto_id:project,titulo:title,created_at:'2026-10-25T00:00:00Z',updated_at:'2026-10-25T00:00:00Z'};
  }
  async addMessage(_conversation:string,_sender:'user'|'assistant',text:string){this.questions.push(text);return randomUUID();}
  async retryMessage(conversation:string,message:string,text:string){this.retries.push({conversation,message,text});return message;}
  async findOwnedConversation(conversation:string,user:string){return {id:conversation,usuario_id:user,projeto_id:randomUUID(),titulo:'Retry',created_at:'2026-10-25T00:00:00Z',updated_at:'2026-10-25T00:00:00Z'};}
  async finishMessage(){}
}
const assistant={ask:async()=>({resposta:NOT_FOUND_ANSWER,fontes:[]})};

test('chat e RAG recusam caracteres incompatíveis com o banco antes de gravar',async()=>{
  const chats=new RecordingChats(),service=new ChatService(chats,assistant);
  for(const invalid of ['\u0000','\uD800','\uDC00']) {
    const question='Consultar '+invalid+' evidências';
    assert.equal(ragInput.safeParse({pergunta:question}).success,false);
    await assert.rejects(()=>service.query(randomUUID(),{pergunta:question,projetoId:randomUUID()}),ValidationError);
  }
  assert.deepEqual(chats.titles,[]);
});

test('abreviar um título não divide um emoji nem altera a pergunta',async()=>{
  const chats=new RecordingChats(),service=new ChatService(chats,assistant);
  const question='a'.repeat(56)+'😀'+'b'.repeat(10);
  await service.query(randomUUID(),{pergunta:question,projetoId:randomUUID()});
  assert.equal(/[\uD800-\uDFFF]/u.test(chats.titles[0]),false);
  assert.ok(chats.titles[0].includes('😀'));
  assert.deepEqual(chats.questions,[question]);
});
test('título informado pelo usuário também preserva emojis e recusa texto inválido',async()=>{
  const chats=new RecordingChats(),service=new ChatService(chats,assistant);
  await assert.rejects(()=>service.createConversation(randomUUID(),{projetoId:randomUUID(),titulo:'Título\u0000inválido'}),ValidationError);
  assert.equal(chats.titles.length,0);
  await service.createConversation(randomUUID(),{projetoId:randomUUID(),titulo:'x'.repeat(119)+'😀'+'fim'});
  assert.equal(/[\uD800-\uDFFF]/u.test(chats.titles[0]),false);assert.ok(chats.titles[0].endsWith('😀'));
});

test('retry reutiliza a mensagem falha existente em vez de criar outra',async()=>{
  const chats=new RecordingChats(),service=new ChatService(chats,assistant);
  const user=randomUUID(),conversation=randomUUID(),message=randomUUID();
  await service.query(user,{pergunta:'Pergunta original',conversaId:conversation,mensagemId:message});
  assert.deepEqual(chats.retries,[{conversation,message,text:'Pergunta original'}]);
  assert.deepEqual(chats.questions,[]);
  await assert.rejects(()=>service.query(user,{pergunta:'Pergunta original',mensagemId:message}),ValidationError);
});
