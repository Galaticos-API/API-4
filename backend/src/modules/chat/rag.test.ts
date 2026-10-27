import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateEvidence,usedSources,RagService } from './rag.service.js';
import { ChatRepository } from './chat.repository.js';
import { SearchRepository } from '../search/search.repository.js';
import { HarnessRepository } from '../harness/harness.repository.js';
import { defaultConfig } from '../harness/harness.contract.js';
import type { HybridSearchRow } from '../search/search.types.js';

const project=randomUUID(),chunk=randomUUID(),other=randomUUID(),entity=randomUUID();
const row:HybridSearchRow={id:chunk,entity_id:entity,entity_type:'documento',project_id:project,project_name:'Projeto A',title:'Login',text:'O login exige autenticação.',metadata:{},source_url:`/projects/${project}/documents`,relevance_score:1};
const currentRow=(text=row.text)=>({id:chunk,texto:text,projeto_id:project,entidade_tipo:row.entity_type,entidade_id:row.entity_id,metadados_json:row.metadata});
test('RAG só aceita citações literais de trechos enviados e elimina repetições',()=>{
  const context=[{id:chunk,text:row.text}];
  assert.deepEqual(validateEvidence({evidence:[{source_id:chunk,quote:row.text},{source_id:chunk,quote:row.text}]},context),[{source_id:chunk,quote:row.text}]);
  for(const value of [{evidence:[{source_id:other,quote:row.text}]},{evidence:[{source_id:chunk,quote:'O login usa SMS.'}]},{evidence:[],answer:'Afirmação inventada'}]) {
    assert.throws(()=>validateEvidence(value,context));
  }
});
test('RAG normaliza UUIDs válidos em maiúsculas sem duplicar a evidência',()=>{
  const id='abcdef01-abcd-4abc-8abc-abcdef012345';
  const result=validateEvidence({evidence:[
    {source_id:id.toUpperCase(),quote:row.text},
    {source_id:id,quote:row.text},
  ]},[{id,text:row.text}]);
  assert.deepEqual(result,[{source_id:id,quote:row.text}]);
});
test('RAG apresenta somente itens utilizados e agrega trechos da mesma origem',()=>{
  const result=usedSources([row,{...row,id:other},{...row,id:randomUUID(),entity_id:randomUUID()}],[{source_id:chunk,quote:row.text},{source_id:other,quote:row.text}]);
  assert.equal(result.length,1);assert.deepEqual(result[0].chunk_ids,[chunk,other]);assert.equal(result[0].projeto_nome,'Projeto A');
});
test('RAG recusa recortar uma negação ou publicar fragmento incompleto de frase',()=>{
  const context=[{id:chunk,text:'O login não exige SMS. A senha é obrigatória.'}];
  for(const quote of ['exige SMS.','não exige SMS.','A senha é'])assert.throws(()=>validateEvidence({evidence:[{source_id:chunk,quote}]},context));
  assert.equal(validateEvidence({evidence:[{source_id:chunk,quote:'A senha é obrigatória.'}]},context).length,1);
});
class Chats extends ChatRepository {
  allowed=true;
  async accessibleProjects(){return [{id:project,nome:'Projeto A'}];}
  async currentRagChunks(){return this.allowed?[currentRow()]:[];}
}
class Search extends SearchRepository {async hybridSearch(){return [row];}}
class Revisions extends HarnessRepository {async current(){return {mode:'consulta' as const,version:0,schema_version:1 as const,config:defaultConfig('consulta'),created_at:null,created_by:null};}}
test('RAG recupera contexto limitado, retorna evidências e revalida as fontes antes de responder',async()=>{
  const chats=new Chats();let calls=0;
  const stages:string[]=[];
  const service=new RagService(chats,new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async(payload)=>{calls++;assert.deepEqual(payload.context,[{id:chunk,text:row.text}]);return {evidence:[{source_id:chunk.toUpperCase(),quote:row.text}]};},
  });
  const answer=await service.answer(randomUUID(),'Como funciona o login?',[project],stage=>stages.push(stage));
  assert.deepEqual(stages,['searching','synthesizing','validating']);
  assert.deepEqual(answer.evidencias,[{chunk_id:chunk,texto:row.text}]);assert.equal(answer.fontes.length,1);
  await assert.rejects(()=>service.answer(randomUUID(),'Login',[other]),/Projeto não encontrado/);assert.equal(calls,1);
  chats.allowed=false;
  await assert.rejects(()=>service.answer(randomUUID(),'Login',[project]),/validar as evidências/);
});
test('RAG não publica uma frase que ficou incompleta no limite do contexto',async()=>{
  const prefix='Linha completa.\n'.repeat(498);
  const beginning='A autenticação exige senha';
  const padding=' '.repeat(8000-prefix.length-beginning.length);
  const text=prefix+padding+beginning+', exceto quando há autenticação externa.';
  class TruncatedSearch extends SearchRepository {async hybridSearch(){return [{...row,text}];}}
  class CurrentChats extends Chats {async currentRagChunks(){return [currentRow(text)];}}
  const service=new RagService(new CurrentChats(),new TruncatedSearch(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async()=>({evidence:[{source_id:chunk,quote:beginning}]}),
  });
  await assert.rejects(()=>service.answer(randomUUID(),'Como autenticar?',[project]),/validar as evidências/);
});
test('RAG rejeita resposta se a fonte ganhou uma ressalva durante a geração',async()=>{
  class ChangedChats extends Chats {
    async currentRagChunks(){return [currentRow(row.text+' Regra anterior revogada: o login agora usa autenticação externa.')];}
  }
  const service=new RagService(new ChangedChats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async()=>({evidence:[{source_id:chunk,quote:row.text}]}),
  });
  await assert.rejects(()=>service.answer(randomUUID(),'Como funciona o login?',[project]),/validar as evidências/);
});
test('RAG não apresenta identificação ou metadados antigos de uma fonte alterada',async()=>{
  for(const changed of [
    {...currentRow(),entidade_id:randomUUID()},
    {...currentRow(),metadados_json:{source_path:'nova-origem.md'}},
  ]) {
    class ChangedChats extends Chats {async currentRagChunks(){return [changed];}}
    const service=new RagService(new ChangedChats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
      generate:async()=>({evidence:[{source_id:chunk,quote:row.text}]}),
    });
    await assert.rejects(()=>service.answer(randomUUID(),'Como funciona o login?',[project]),/validar as evidências/);
  }
});
test('RAG respeita os limites de contexto mesmo com múltiplos trechos grandes',async()=>{
  class LargeSearch extends SearchRepository {
    async hybridSearch(){return Array.from({length:5},()=>({...row,id:randomUUID(),text:'Texto de evidência. '.repeat(1000)}));}
  }
  let generated=false;
  const service=new RagService(new Chats(),new LargeSearch(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async payload=>{
      generated=true;
      const context=payload.context as Array<{id:string;text:string}>;
      assert.ok(context.every(item=>item.text.length<=8000));
      assert.ok(context.reduce((size,item)=>size+item.text.length,0)<=20000);
      assert.ok(context.length>0);return {evidence:[]};
    },
  });
  const result=await service.answer(randomUUID(),'Consultar evidências',[project]);
  assert.ok(generated);assert.deepEqual(result.evidencias,[]);assert.deepEqual(result.fontes,[]);
});
test('RAG registra tempos por etapa sem incluir pergunta ou conteúdo dos documentos',async()=>{
  const entries:unknown[][]=[];
  const original=console.info;
  console.info=(...args:unknown[])=>{entries.push(args);};
  try {
    const service=new RagService(new Chats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
      generate:async()=>({evidence:[{source_id:chunk,quote:row.text}]}),
    });
    await service.answer(randomUUID(),'Pergunta confidencial',[project]);
  } finally { console.info=original; }
  assert.equal(entries.length,1);
  assert.equal(entries[0][0],'[RAG] Request completed');
  const event=entries[0][1] as Record<string,unknown>;
  assert.equal(typeof event.duracao_total_ms,'number');
  assert.equal(typeof event.diagnostico_id,'string');
  assert.deepEqual(Object.keys(event.duracoes_ms as Record<string,number>).sort(),['busca_hibrida','embedding','geracao_e_validacao_harness','revalidacao_fontes']);
  assert.equal(event.resultados_recuperados,1);
  assert.equal(event.fontes_utilizadas,1);
  assert.doesNotMatch(JSON.stringify(entries),/Pergunta confidencial|O login exige autenticação/);
});
