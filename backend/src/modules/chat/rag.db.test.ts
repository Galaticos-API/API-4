import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { validateTarget } from '../../database/seed-lib.js';
import { RagService } from './rag.service.js';
import { ChatRepository } from './chat.repository.js';
import { ChatService } from './chat.service.js';
import { HttpHarnessEngine } from '../harness/harness.service.js';
import { HttpSearchEmbeddingClient } from '../search/search.service.js';
import { SearchRepository } from '../search/search.repository.js';
import { HarnessRepository } from '../harness/harness.repository.js';
import { NO_CANDIDATES_ANSWER,NOT_FOUND_ANSWER,PARTIAL_ANSWER_NOTICE,SCOPE_LIMIT_ANSWER } from './chat.types.js';

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
    return {coverage:'complete',evidence:context.map(row=>({source_id:invalid?randomUUID():row.id,quote:row.text}))};
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
      assert.ok(result.resposta.startsWith(NO_CANDIDATES_ANSWER));assert.ok(result.resposta.includes(SCOPE_LIMIT_ANSWER));assert.deepEqual(result.fontes,[]);assert.equal(modelCalls,previous);
    });
    await t.test('HTTP recusa perguntas e títulos inválidos sem criar conversas órfãs',async()=>{
      const {app}=await import('../../app.js');
      const {sessionService}=await import('../auth/session.service.js');
      const token=(await sessionService.createSession(dev)).token;
      const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
      const base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/v1/chat/';
      const before=(await db.query('SELECT count(*)::int AS n FROM conversa WHERE usuario_id=$1',[dev])).rows[0].n;
      try {
        for(const invalid of ['\u0000','\uD800','\uDC00']) {
          for(const [path,body] of [['query',{pergunta:'Consultar '+invalid,projeto_id:a}],['answer',{pergunta:'Consultar '+invalid,projeto_ids:[a]}],['conversations',{titulo:'Título '+invalid,projeto_id:a}]] as const) {
            const response=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
            assert.equal(response.status,400);assert.equal((await response.json() as {code:string}).code,'VALIDATION_ERROR');
          }
        }
        assert.equal((await db.query('SELECT count(*)::int AS n FROM conversa WHERE usuario_id=$1',[dev])).rows[0].n,before);
      } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
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
    await t.test('modelo local real recupera evidências e cita somente projetos autorizados',{skip:!process.env.RAG_REAL_AI_URL},async()=>{
      const embeddings=new HttpSearchEmbeddingClient(process.env.RAG_REAL_AI_URL!);
      const real=new RagService(new ChatRepository(db),new SearchRepository(db),embeddings,new HarnessRepository(db),new HttpHarnessEngine(process.env.RAG_REAL_AI_URL!));
      try {
        for(const id of [chunkA,chunkB]) {
          const text=(await db.query('SELECT texto FROM chunk WHERE id=$1',[id])).rows[0].texto;
          await db.query('UPDATE chunk SET embedding=$2::vector WHERE id=$1',[id,JSON.stringify(await embeddings.embed(text))]);
        }
        const answer=await real.answer(dev,'Como o projeto A usa WhatsApp?',[a]);
        assert.ok(answer.evidencias.length>0,'O modelo real não selecionou a evidência conhecida.');
        assert.ok(answer.fontes.every(source=>source.projeto_id===a));
        assert.ok(answer.evidencias.every(evidence=>evidence.chunk_id===chunkA));
        assert.equal(answer.cobertura,'complete');
        const partial=await real.answer(dev,'Para que o projeto A integra WhatsApp e qual sistema de pagamentos usa?',[a]);
        assert.equal(partial.cobertura,'partial','O modelo deve distinguir o aspecto sem evidência da parte respondida.');
        assert.ok(partial.resposta.includes(PARTIAL_ANSWER_NOTICE));
        assert.deepEqual(partial.evidencias.map(evidence=>evidence.chunk_id),[chunkA]);
        assert.doesNotMatch(partial.resposta,/pix|cartão|boleto/i);
        const transversal=await real.answer(admin,'Quais usos do WhatsApp existem nos projetos?',[a,b]);
        assert.deepEqual(new Set(transversal.fontes.map(source=>source.projeto_id)),new Set([a,b]));
        const missing=await real.answer(dev,'Qual política de autenticação biométrica foi definida?',[a]);
        assert.ok(missing.resposta.startsWith(NO_CANDIDATES_ANSWER));assert.deepEqual(missing.fontes,[]);
        assert.equal(missing.cobertura,'no_evidence');

        const offTopic=new RagService(new ChatRepository(db),new SearchRepository(db),embeddings,new HarnessRepository(db),new HttpHarnessEngine(process.env.RAG_REAL_AI_URL!));
        const refusal=await offTopic.answer(dev,'Qual é a capital da França?',[a]);
        assert.ok(refusal.cobertura==='out_of_scope'||refusal.cobertura==='no_evidence',`Pergunta fora do domínio não deve receber evidência: ${JSON.stringify(refusal)}`);
        assert.deepEqual(refusal.evidencias,[]);
        assert.deepEqual(refusal.fontes,[]);
        assert.doesNotMatch(refusal.resposta,/Paris|capital da França/i);
      } finally {await db.query('UPDATE chunk SET embedding=$2::vector WHERE id=ANY($1::uuid[])',[[chunkA,chunkB],JSON.stringify(vector)]);}
    });
    await t.test('revogação entre autorização e leitura não divulga mensagens do histórico',async()=>{
      const repository=new ChatRepository(db);
      const conversation=await repository.createConversation(dev,a,'Conversa para testar revogação');
      await repository.addMessage(conversation.id,'assistant','Conteúdo privado do projeto A.');
      const guardedPool={query:async(sql:string,values:unknown[])=>{
        if(sql.includes('FROM mensagem'))await db.query("UPDATE alocacao SET data_fim=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE desenvolvedor_id=$1",[developer]);
        return db.query(sql,values);
      }} as unknown as Pool;
      try {
        const history=await new ChatService(new ChatRepository(guardedPool)).listMessages(dev,conversation.id);
        assert.deepEqual(history,[]);
      } finally {await db.query('UPDATE alocacao SET data_fim=NULL WHERE desenvolvedor_id=$1',[developer]);}
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
