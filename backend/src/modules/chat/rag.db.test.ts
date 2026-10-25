import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { validateTarget } from '../../database/seed-lib.js';
import { RagService } from './rag.service.js';
import { ChatRepository } from './chat.repository.js';
import { SearchRepository } from '../search/search.repository.js';
import { HarnessRepository } from '../harness/harness.repository.js';
import { NOT_FOUND_ANSWER } from './chat.types.js';

test('S2-24: busca híbrida, evidências, escopo transversal autorizado e revogação em PostgreSQL',{skip:!process.env.QUALITY_TEST_DATABASE_URL},async t=>{
  const db=new Pool({connectionString:validateTarget(process.env.QUALITY_TEST_DATABASE_URL,'test')});
  const {pool}=await import('../../database/db.js');
  const [admin,dev,developer,a,b,docA,docB,chunkA,chunkB]=Array.from({length:9},()=>randomUUID());
  const vector=[1,...Array(1023).fill(0)];let calls=0,modelCalls=0;
  let revoke=false,invalid=false,invalidate=false,changeContent=false;
  const engine={generate:async(payload:Record<string,unknown>)=>{
    modelCalls++;
    const context=payload.context as Array<{id:string;text:string}>;
    if(revoke)await db.query('DELETE FROM alocacao WHERE desenvolvedor_id=$1',[developer]);
    if(invalidate)await db.query("UPDATE documento SET status_processamento='falha' WHERE id=$1",[docA]);
    if(changeContent)await db.query("UPDATE chunk SET texto=texto || ' Regra anterior revogada: a integração foi desativada.' WHERE id=$1",[chunkA]);
    return {evidence:context.map(row=>({source_id:invalid?randomUUID():row.id,quote:row.text}))};
  }};
  const service=new RagService(new ChatRepository(db),new SearchRepository(db),{embed:async text=>{
    calls++;return text==='assunto inexistente'?[0,1,...Array(1022).fill(0)]:vector;
  }},new HarnessRepository(db),engine);
  try {
    await db.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES ($1,'Admin',$3,'h','admin'),($2,'Dev',$4,'h','dev')",[admin,dev,admin+'@rag.test',dev+'@rag.test']);
    await db.query('INSERT INTO desenvolvedor(id,usuario_id) VALUES ($1,$2)',[developer,dev]);
    await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES ($1,'RAG A','QA','ativo'),($2,'RAG B','QA','ativo')",[a,b]);
    await db.query("INSERT INTO alocacao(desenvolvedor_id,projeto_id,data_inicio) VALUES ($1,$2,CURRENT_TIMESTAMP-INTERVAL '1 day')",[developer,a]);
    for(const [project,doc,chunk,text] of [[a,docA,chunkA,'O projeto A integra WhatsApp para avisos.'],[b,docB,chunkB,'O projeto B integra WhatsApp para suporte.']]) {
      await db.query("INSERT INTO documento(id,projeto_id,nome,caminho,status_processamento) VALUES ($1,$2,'WhatsApp.txt','rag.txt','processado')",[doc,project]);
      await db.query("INSERT INTO chunk(id,projeto_id,entidade_tipo,entidade_id,texto,embedding) VALUES ($1,$2,'documento',$3,$4,$5::vector)",[chunk,project,doc,text,JSON.stringify(vector)]);
    }
    await t.test('pergunta transversal recupera projetos autorizados e publica apenas fontes citadas',async()=>{
      const result=await service.answer(admin,'Quais projetos integram WhatsApp?',[a,b]);
      assert.deepEqual(new Set(result.fontes.map(row=>row.projeto_id)),new Set([a,b]));
      assert.equal(result.evidencias.length,2);assert.ok(result.fontes.every(source=>source.url?.startsWith('/projects/')));
      assert.ok(result.resposta.includes('RAG A'));assert.ok(result.resposta.includes('RAG B'));
    });
    await t.test('desenvolvedor não recupera projeto sem alocação e não chama embeddings em escopo proibido',async()=>{
      const result=await service.answer(dev,'WhatsApp');assert.deepEqual(result.fontes.map(source=>source.projeto_id),[a]);
      const previous=calls;await assert.rejects(()=>service.answer(dev,'WhatsApp',[b]),/Projeto não encontrado/);assert.equal(calls,previous);
    });
    await t.test('sem recuperação pertinente não aciona geração',async()=>{
      const previous=modelCalls;const result=await service.answer(admin,'assunto inexistente',[a,b]);
      assert.equal(result.resposta,NOT_FOUND_ANSWER);assert.deepEqual(result.fontes,[]);assert.equal(modelCalls,previous);
    });
    await t.test('modelo não pode citar um ID inventado',async()=>{
      invalid=true;try{await assert.rejects(()=>service.answer(dev,'WhatsApp',[a]),/validar as evidências/);}finally{invalid=false;}
    });
    await t.test('ressalva acrescentada durante geração invalida o contexto antigo',async()=>{
      const original=(await db.query('SELECT texto FROM chunk WHERE id=$1',[chunkA])).rows[0].texto;
      changeContent=true;
      try {await assert.rejects(()=>service.answer(dev,'WhatsApp',[a]),/validar as evidências/);}
      finally {changeContent=false;await db.query('UPDATE chunk SET texto=$2 WHERE id=$1',[chunkA,original]);}
    });
    await t.test('documento que perde a elegibilidade durante a geração não é divulgado',async()=>{
      invalidate=true;
      try {await assert.rejects(()=>service.answer(dev,'WhatsApp',[a]),/validar as evidências/);}
      finally {invalidate=false;await db.query("UPDATE documento SET status_processamento='processado' WHERE id=$1",[docA]);}
    });
    await t.test('revogação de acesso durante geração impede divulgar a resposta',async()=>{
      revoke=true;await assert.rejects(()=>service.answer(dev,'WhatsApp',[a]),/validar as evidências/);revoke=false;
    });
    await t.test('projeto arquivado é excluído do contexto',async()=>{
      await db.query("UPDATE projeto SET status='arquivado' WHERE id=$1",[b]);
      const result=await service.answer(admin,'WhatsApp',[a,b]);assert.ok(result.fontes.every(source=>source.projeto_id===a));
    });
  } finally {await db.end();await pool.end();}
});
