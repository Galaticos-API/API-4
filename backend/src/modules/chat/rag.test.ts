import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { validateEvidence,validateEvidenceResponse,evidenceOutputSchema,formatVerifiedEvidence,usedSources,RagService,splitCompoundQuestion,isClearlyOutsideKnowledge,supportsRequestedDecision } from './rag.service.js';
import { ChatRepository } from './chat.repository.js';
import { SearchRepository } from '../search/search.repository.js';
import { HarnessRepository } from '../harness/harness.repository.js';
import { defaultConfig,ModelOutputRejectedError } from '../harness/harness.contract.js';
import { HttpHarnessEngine } from '../harness/harness.service.js';
import { reconcileEvidenceResponse,resolveQuote,wholePassage } from './rag-evidence.js';
import { NO_CANDIDATES_ANSWER,NOT_FOUND_ANSWER,PARTIAL_ANSWER_NOTICE,SCOPE_LIMIT_ANSWER,UNAVAILABLE_ASPECT_NOTICE } from './chat.types.js';
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
test('RAG aceita passagem literal completa no início de um chunk mesmo em minúscula',()=>{
  const text='token expirado bloqueia a sessão.';
  assert.equal(wholePassage(text,text),true);
  assert.deepEqual(resolveQuote([{id:chunk,text}],chunk,text),{source_id:chunk,quote:text});
  assert.deepEqual(validateEvidence({evidence:[{source_id:chunk,quote:text}]},[{id:chunk,text}]),[{source_id:chunk,quote:text}]);
});
test('RAG valida cobertura parcial e exige consistência entre classificação e evidências',()=>{
  const citation={source_id:chunk,quote:row.text};
  const context=[{id:chunk,text:row.text}];
  for(const coverage of ['complete','partial'] as const)
    assert.deepEqual(validateEvidenceResponse({coverage,evidence:[citation]},context),{coverage,evidence:[citation]});
  for(const coverage of ['no_evidence','out_of_scope'] as const)
    assert.deepEqual(validateEvidenceResponse({coverage,evidence:[]},context),{coverage,evidence:[]});
  for(const invalid of [
    {coverage:'complete',evidence:[]},
    {coverage:'partial',evidence:[]},
    {coverage:'no_evidence',evidence:[citation]},
    {coverage:'out_of_scope',evidence:[citation]},
    {coverage:'unsupported',evidence:[]},
    {coverage:'out_of_scope',evidence:[],answer:'Conteúdo não verificado.'},
  ]) assert.throws(()=>validateEvidenceResponse(invalid,context));
});
test('resposta final é montada somente com o trecho literal validado e seu UUID',()=>{
  assert.equal(formatVerifiedEvidence([{source_id:chunk,quote:row.text}]),`Trecho literal encontrado no acervo: O login exige autenticação\\. [${chunk}]`);
  assert.equal(formatVerifiedEvidence([{source_id:chunk,quote:row.text},{source_id:other,quote:'A senha deve ter 12 caracteres.'}]),
    `Trechos literais encontrados no acervo:\n\n- O login exige autenticação\\. [${chunk}]\n- A senha deve ter 12 caracteres\\. [${other}]`);
});
test('RAG separa perguntas coordenadas sem dividir termos nominais',()=>{
  assert.deepEqual(splitCompoundQuestion('Para que o projeto integra WhatsApp e qual sistema de pagamentos usa?'),[
    'Para que o projeto integra WhatsApp?','qual sistema de pagamentos usa?',
  ]);
  assert.deepEqual(splitCompoundQuestion('Qual banco de dados e API estamos usando?'),['Qual banco de dados e API estamos usando?']);
});
class Chats extends ChatRepository {
  allowed=true;
  async accessibleProjects(){return [{id:project,nome:'Projeto A'}];}
  async currentRagChunks(){return this.allowed?[currentRow()]:[];}
}
class Search extends SearchRepository {async hybridSearch(){return [row];}}
class Revisions extends HarnessRepository {async current(){return {mode:'consulta' as const,version:0,schema_version:1 as const,config:defaultConfig('consulta'),created_at:null,created_by:null};}}
test('RAG applies one default search deadline to access, retrieval, and evidence revalidation',async()=>{
  const deadlines:{accessible?:number;search?:number;current?:number}={};
  class DeadlineChats extends ChatRepository {
    async accessibleProjects(...args:Parameters<ChatRepository['accessibleProjects']>){deadlines.accessible=args[1];return [{id:project,nome:'Projeto A'}];}
    async currentRagChunks(...args:Parameters<ChatRepository['currentRagChunks']>){deadlines.current=args[2];return [currentRow()];}
  }
  class DeadlineSearch extends SearchRepository {
    async hybridSearch(...args:Parameters<SearchRepository['hybridSearch']>){deadlines.search=args[6];return [row];}
  }
  const service=new RagService(new DeadlineChats(),new DeadlineSearch(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async()=>({coverage:'complete',evidence:[{source_id:chunk,quote:row.text}]}),
  });
  await service.answer(randomUUID(),'Como funciona o login?',[project]);
  assert.notEqual(deadlines.accessible,undefined);
  assert.notEqual(deadlines.search,undefined);
  assert.notEqual(deadlines.current,undefined);
  assert.ok(deadlines.accessible!>performance.now(),'default deadline should still be in the future');
  assert.equal(deadlines.search,deadlines.accessible);
  assert.equal(deadlines.current,deadlines.accessible);
});
test('RAG recupera contexto limitado, retorna evidências e revalida as fontes antes de responder',async()=>{
  const chats=new Chats();let calls=0;
  const stages:string[]=[];
  const service=new RagService(chats,new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async(payload)=>{
      calls++;
      if(JSON.stringify(payload.output_schema)===JSON.stringify(evidenceOutputSchema)) {
        assert.deepEqual(payload.context,[{id:chunk,text:row.text}]);
        const config=payload.config as {operation_instructions:Record<string,string>};
        assert.match(config.operation_instructions.responder,/complete.*partial.*no_evidence.*out_of_scope/);
        return {coverage:'complete',evidence:[{source_id:chunk.toUpperCase(),quote:row.text}]};
      }
      return {answer:`O login usa SMS. [${chunk}]`,sources:[chunk]};
    },
  });
  const answer=await service.answer(randomUUID(),'Como funciona o login?',[project],stage=>stages.push(stage));
  assert.deepEqual(stages,['searching','synthesizing','validating','synthesizing']);
  assert.deepEqual(answer.evidencias,[{chunk_id:chunk,texto:row.text}]);assert.equal(answer.fontes.length,1);
  assert.match(answer.resposta,/O login exige autenticação/);
  assert.doesNotMatch(answer.resposta,/SMS/);
  await assert.rejects(()=>service.answer(randomUUID(),'Login',[other]),/Projeto não encontrado/);assert.equal(calls,1);
  chats.allowed=false;
  await assert.rejects(()=>service.answer(randomUUID(),'Login',[project]),/validar as evidências/);
});
test('RAG diferencia busca sem candidatos de candidatos sem evidência útil',async()=>{
  class EmptySearch extends SearchRepository {async hybridSearch(){return [];}}
  const embeddings={embed:async()=>Array(1024).fill(0.1)};
  const noCandidates=await new RagService(new Chats(),new EmptySearch(),embeddings,new Revisions(),{generate:async()=>{throw Error('não deve chamar o harness sem candidatos');}})
    .answer(randomUUID(),'Pergunta sem correspondência',[project]);
  assert.equal(noCandidates.resposta,`${NO_CANDIDATES_ANSWER} ${SCOPE_LIMIT_ANSWER}`);

  const unsupported=await new RagService(new Chats(),new Search(),embeddings,new Revisions(),{generate:async()=>({coverage:'no_evidence',evidence:[]})})
    .answer(randomUUID(),'Pergunta sem evidência',[project]);
  assert.match(unsupported.resposta,/Encontrei registros relacionados, mas eles não apresentam evidências suficientes/i);
});
test('RAG amplia pedidos de visão geral usando apenas trechos literais do projeto',async()=>{
  const overviewText='O login exige autenticação.\n\nA senha deve ter 12 caracteres.';
  const overviewRow={...row,text:overviewText};
  class OverviewSearch extends SearchRepository {
    async hybridSearch(){return [];}
    async ragSearch(projectIds:string[],_embedding:number[],limit:number,minimumSimilarity:number){
      assert.deepEqual(projectIds,[project]);assert.equal(limit,5);assert.equal(minimumSimilarity,-1);
      return [overviewRow,{...overviewRow,id:other}];
    }
  }
  class OverviewChats extends Chats {async currentRagChunks(){return [{...currentRow(overviewText),id:chunk},{...currentRow(overviewText),id:other}];}}
  let plannerCalls=0,generateCalls=0;
  const service=new RagService(new OverviewChats(),new OverviewSearch(),{
    embed:async()=>Array(1024).fill(0.1),
    planQuery:async()=>{plannerCalls++;return {queries:[],resolvedQuestion:'fale sobre o projeto',aspects:['fale sobre o projeto']};},
  },new Revisions(),{
    generate:async()=>{
      generateCalls++;
      return {answer:`O sistema usa SMS. [${chunk}]`,sources:[chunk]};
    },
  });
  for(const question of ['Fale sobre o projeto','Resuma o cenário de demonstração e as regras registradas no documento.']) {
    const answer=await service.answer(randomUUID(),question,[project]);
    assert.match(answer.resposta,/login exige autenticação/);assert.match(answer.resposta,/senha deve ter 12 caracteres/);assert.equal(answer.fontes.length,1);
    assert.deepEqual(answer.evidencias,[{chunk_id:chunk,texto:'O login exige autenticação.'},{chunk_id:chunk,texto:'A senha deve ter 12 caracteres.'}]);
  }
  assert.equal(plannerCalls,0,'Pedidos de visão geral não devem perder tempo em uma reescrita sem contexto.');
  assert.equal(generateCalls,0,'A resposta final da visão geral é formada pelas passagens validadas, sem síntese livre.');
});
test('RAG mantém a abstenção exata quando uma visão geral não tem trechos no projeto',async()=>{
  class EmptyOverviewSearch extends SearchRepository {
    async hybridSearch(){return [];}
    async ragSearch(){return [];}
  }
  let generated=false;
  const answer=await new RagService(new Chats(),new EmptyOverviewSearch(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async()=>{generated=true;return {};},
  }).answer(randomUUID(),'Fale sobre o projeto',[project]);
  assert.equal(answer.resposta,NOT_FOUND_ANSWER);assert.deepEqual(answer.fontes,[]);assert.equal(generated,false);
});
test('RAG usa pergunta resolvida na extração e resposta sem encaminhar histórico bruto',async()=>{
  const original='E por que escolheram esse banco?';
  const resolved='Por que o projeto escolheu PostgreSQL como banco de dados?';
  const history=[{role:'user' as const,content:'Qual banco de dados o projeto usa?'},{role:'assistant' as const,content:'O projeto usa PostgreSQL.'}];
  let planHistory:unknown;
  const evidenceText='A equipe escolheu PostgreSQL para usar a extensão pgvector.';
  class DecisionSearch extends SearchRepository {async hybridSearch(){return [{...row,text:evidenceText}];}}
  class DecisionChats extends Chats {async currentRagChunks(){return [currentRow(evidenceText)];}}
  const service=new RagService(new DecisionChats(),new DecisionSearch(),{
    embed:async()=>Array(1024).fill(0.1),
    planQuery:async(_question,_signal,receivedHistory)=>{planHistory=receivedHistory;return {queries:['PostgreSQL motivo da escolha'],resolvedQuestion:resolved,aspects:[resolved]};},
  },new Revisions(),{
    generate:async payload=>{
      assert.equal((payload.fields as {pergunta:string}).pergunta,resolved);
      assert.doesNotMatch(JSON.stringify(payload),/Qual banco de dados o projeto usa\?/);
      if(JSON.stringify(payload.output_schema)===JSON.stringify(evidenceOutputSchema))
        return {coverage:'complete',evidence:[{source_id:chunk,quote:evidenceText}]};
      return {answer:`O projeto usa PostgreSQL. [${chunk}]`,sources:[chunk]};
    },
  });
  const answer=await service.answer(randomUUID(),original,[project],undefined,undefined,history);
  assert.deepEqual(planHistory,history);
  assert.match(answer.resposta,/A equipe escolheu PostgreSQL/);
  assert.doesNotMatch(answer.resposta,/O projeto usa PostgreSQL/);
});
test('RAG mede cobertura por aspecto e marca parcial quando só um pedido encontra evidência',async()=>{
  class AspectSearch extends SearchRepository {
    async hybridSearch(input:{query:string}) {
      return /whatsApp/i.test(input.query)?[row]:[];
    }
  }
  let evidenceCalls=0;
  const resolved='Para que o projeto integra WhatsApp e qual sistema de pagamentos usa?';
  const service=new RagService(new Chats(),new AspectSearch(),{
    embed:async()=>Array(1024).fill(0.1),
    // The planner can return the right aspects in a different order. The
    // deterministic split must keep each aspect aligned to its search result.
    planQuery:async()=>({queries:['finalidade integração WhatsApp','sistema de pagamentos'],resolvedQuestion:resolved,aspects:['Qual sistema de pagamentos usa?','Para que o projeto integra WhatsApp?']}),
  },new Revisions(),{
    generate:async payload=>{
      if(JSON.stringify(payload.output_schema)===JSON.stringify(evidenceOutputSchema)) {
        evidenceCalls++;
        assert.match((payload.fields as {pergunta:string}).pergunta,/WhatsApp/i);
        return {coverage:'complete',evidence:[{source_id:chunk,quote:row.text}]};
      }
      return {answer:`O projeto integra WhatsApp para avisos. [${chunk}]`,sources:[chunk]};
    },
  });
  const result=await service.answer(randomUUID(),resolved,[project]);
  assert.equal(evidenceCalls,1,'Aspecto sem candidatos não deve ser enviado ao modelo como se tivesse evidência.');
  assert.equal(result.cobertura,'partial');
  assert.ok(result.resposta.includes(PARTIAL_ANSWER_NOTICE));
  assert.deepEqual(result.evidencias,[{chunk_id:chunk,texto:row.text}]);
});
test('RAG não publica uma frase que ficou incompleta no limite do contexto',async()=>{
  const prefix='Linha completa.\n'.repeat(498);
  const beginning='A autenticação exige senha';
  const padding=' '.repeat(8000-prefix.length-beginning.length);
  const text=prefix+padding+beginning+', exceto quando há autenticação externa.';
  class TruncatedSearch extends SearchRepository {async hybridSearch(){return [{...row,text}];}}
  class CurrentChats extends Chats {async currentRagChunks(){return [currentRow(text)];}}
  const service=new RagService(new CurrentChats(),new TruncatedSearch(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async()=>({coverage:'complete',evidence:[{source_id:chunk,quote:beginning}]}),
  });
  await assert.rejects(()=>service.answer(randomUUID(),'Como autenticar?',[project]),/validar as evidências/);
});
test('RAG rejeita resposta se a fonte ganhou uma ressalva durante a geração',async()=>{
  class ChangedChats extends Chats {
    async currentRagChunks(){return [currentRow(row.text+' Regra anterior revogada: o login agora usa autenticação externa.')];}
  }
  const service=new RagService(new ChangedChats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async()=>({coverage:'complete',evidence:[{source_id:chunk,quote:row.text}]}),
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
      generate:async payload=>JSON.stringify(payload.output_schema)===JSON.stringify(evidenceOutputSchema)
        ?({coverage:'complete',evidence:[{source_id:chunk,quote:row.text}]})
        :({answer:`O login exige autenticação. [${chunk}]`,sources:[chunk]}),
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
      assert.ok(context.length>0);return {coverage:'no_evidence',evidence:[]};
    },
  });
  const result=await service.answer(randomUUID(),'Consultar evidências',[project]);
  assert.ok(generated);assert.equal(result.cobertura,'no_evidence');assert.match(result.resposta,/Se quiser, reformule usando o nome de uma funcionalidade/i);assert.match(result.resposta,/Também posso resumir requisitos e decisões/i);assert.deepEqual(result.evidencias,[]);assert.deepEqual(result.fontes,[]);
});
test('RAG registra tempos por etapa sem incluir pergunta ou conteúdo dos documentos',async()=>{
  const entries:unknown[][]=[];
  const original=console.info;
  console.info=(...args:unknown[])=>{entries.push(args);};
  try {
    const service=new RagService(new Chats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
      generate:async()=>({coverage:'complete',evidence:[{source_id:chunk,quote:row.text}]}),
    });
    await service.answer(randomUUID(),'Pergunta confidencial',[project]);
  } finally { console.info=original; }
  assert.equal(entries.length,1);
  assert.equal(entries[0][0],'[RAG] Request completed');
  const event=entries[0][1] as Record<string,unknown>;
  assert.equal(typeof event.duracao_total_ms,'number');
  assert.equal(typeof event.diagnostico_id,'string');
  assert.deepEqual(Object.keys(event.duracoes_ms as Record<string,number>).sort(),['busca_hibrida','embedding','geracao_e_validacao_harness','interpretacao_pergunta','montagem_resposta','revalidacao_fontes']);
  assert.equal(event.resultados_recuperados,1);
  assert.equal(event.fontes_utilizadas,1);
  assert.doesNotMatch(JSON.stringify(entries),/Pergunta confidencial|O login exige autenticação/);
});
test('RAG explicita que a resposta parcial não cobre toda a pergunta',async()=>{
  const service=new RagService(new Chats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async()=>({coverage:'partial',evidence:[{source_id:chunk,quote:row.text}]}),
  });
  const answer=await service.answer(randomUUID(),'Como funciona o login e qual o prazo de recuperação?',[project]);
  assert.equal(answer.cobertura,'partial');
  assert.deepEqual(answer.evidencias,[{chunk_id:chunk,texto:row.text}]);
  assert.match(answer.resposta,/consegui confirmar parte.*outros pontos não aparecem/i);
  assert.equal(answer.fontes.length,1);
});
test('RAG bloqueia assunto explicitamente fora do escopo e não publica fontes',async()=>{
  const service=new RagService(new Chats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async()=>({coverage:'out_of_scope',evidence:[]}),
  });
  const answer=await service.answer(randomUUID(),'Qual é a capital da França?',[project]);
  assert.equal(answer.cobertura,'out_of_scope');
  assert.match(answer.resposta,/fora do contexto dos projetos consultados/i);
  assert.match(answer.resposta,/Posso ajudar com requisitos, decisões técnicas/i);
  assert.deepEqual(answer.fontes,[]);
  assert.deepEqual(answer.evidencias,[]);
});
test('RAG tolera variação de espaço, caixa, acento e Markdown, mas publica a passagem literal',()=>{
  const text='## Pagamento\n- A **confirmação** do PIX ocorre por webhook do PSP em até 5 segundos.\nO estorno não é automático.';
  const context=[{id:chunk,text}];
  const literal='- A **confirmação** do PIX ocorre por webhook do PSP em até 5 segundos.';
  for(const quote of ['A confirmacao do PIX  ocorre por webhook do psp em até 5 segundos','“A confirmação do PIX ocorre por webhook do PSP em até 5 segundos.”'])
    assert.deepEqual(resolveQuote(context,chunk,quote),{source_id:chunk,quote:literal});
  // Recorte de frase vira a frase inteira, sem perder a negação.
  assert.deepEqual(resolveQuote(context,chunk,'é automático'),undefined,'recorte curto demais não identifica a passagem');
  assert.deepEqual(resolveQuote(context,chunk,'estorno não é automático'),{source_id:chunk,quote:'O estorno não é automático.'});
  // Paráfrase e citação atribuída à fonte errada.
  assert.equal(resolveQuote(context,chunk,'O PIX é confirmado por webhook em até 5 segundos.'),undefined);
  assert.deepEqual(resolveQuote([{id:other,text:'Outro trecho.'},...context],other,'O estorno não é automático.'),{source_id:chunk,quote:'O estorno não é automático.'});
  // Pergunta e título não afirmam fatos.
  const faq=[{id:chunk,text:'## Perguntas úteis\n- Quantas tentativas inválidas acionam o bloqueio?'}];
  assert.equal(resolveQuote(faq,chunk,'- Quantas tentativas inválidas acionam o bloqueio?'),undefined);
  assert.equal(resolveQuote(faq,chunk,'## Perguntas úteis'),undefined);
});
test('RAG não publica citação que começa no meio de uma palavra na borda do chunk',()=>{
  // Chunking real: o anterior termina no overlap de 150 caracteres do próximo.
  const overlap='ibutos do token são válidos, a aplicação aceita o acesso. '.repeat(4).slice(0,150);
  const previous={id:other,text:`${'x'.repeat(850)}atr${overlap}`};
  const cut={id:chunk,text:`${overlap}\nLogin exige autenticação.`};
  assert.ok(cut.text.length>150);
  assert.ok(previous.text.endsWith(cut.text.slice(0,150)));
  assert.equal(wholePassage(cut.text,cut.text),true,'sem o chunk vizinho, uma passagem lowercase completa é indistinguível de um corte');
  assert.equal(resolveQuote([cut],chunk,cut.text)?.source_id,chunk);
  assert.equal(resolveQuote([cut,previous],chunk,cut.text),undefined,'o overlap mostra que o início do chunk cortou a palavra `atributos`');
  assert.throws(()=>validateEvidence({evidence:[{source_id:chunk,quote:cut.text}]},[cut,previous]));
  assert.deepEqual(resolveQuote([cut,previous],chunk,'Login exige autenticação.'),{source_id:chunk,quote:'Login exige autenticação.'});
  assert.deepEqual(validateEvidence({evidence:[{source_id:chunk,quote:'Login exige autenticação.'}]},[cut,previous]),
    [{source_id:chunk,quote:'Login exige autenticação.'}]);
  assert.equal(wholePassage('Linha completa.','Linha completa.'),true);
});
test('RAG reconcilia a resposta do modelo sem lançar e só rebaixa a cobertura',()=>{
  const context=[{id:chunk,text:row.text}];
  const valid={source_id:chunk,quote:row.text},invented={source_id:chunk,quote:'O login usa SMS e biometria facial.'};
  assert.deepEqual(reconcileEvidenceResponse({coverage:'complete',evidence:[valid]},context),{coverage:'complete',evidence:[valid],coverageConflict:false,adjusted:false});
  assert.deepEqual(reconcileEvidenceResponse({coverage:'complete',evidence:[valid,invented]},context),{coverage:'partial',evidence:[valid],coverageConflict:false,adjusted:true});
  for(const value of [{coverage:'complete',evidence:[invented]},{coverage:'complete',evidence:[]},null,'texto livre'])
    assert.deepEqual(reconcileEvidenceResponse(value,context).evidence,[]);
  for(const coverage of ['no_evidence','out_of_scope'] as const) {
    const result=reconcileEvidenceResponse({coverage,evidence:[valid]},context);
    assert.deepEqual(result,{coverage:'partial',evidence:[valid],coverageConflict:true,adjusted:true});
  }
});
test('RAG preserva citações verificadas quando a cobertura declarada as contradiz, sem inventar resposta',async()=>{
  const service=new RagService(new Chats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async()=>({coverage:'no_evidence',evidence:[{source_id:chunk,quote:row.text}]}),
  });
  const answer=await service.answer(randomUUID(),'Como funciona o login?',[project]);
  assert.equal(answer.cobertura,'partial');
  assert.match(answer.resposta,/Trecho literal encontrado no acervo/);
  assert.match(answer.resposta,/não consegui confirmar se respondem a todos os pontos/i);
  assert.match(answer.resposta,/O login exige autenticação/);
  assert.doesNotMatch(answer.resposta,/usa SMS/i);
  assert.deepEqual(answer.evidencias,[{chunk_id:chunk,texto:row.text}]);
});
test('RAG responde com o aspecto válido quando a citação de outro aspecto é recusada',async()=>{
  const question='Como funciona o login e qual o prazo de recuperação?';
  const service=new RagService(new Chats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async payload=>{
      return /login/i.test((payload.fields as {pergunta:string}).pergunta)
        ?{coverage:'complete',evidence:[{source_id:chunk,quote:row.text}]}
        :{coverage:'complete',evidence:[{source_id:chunk,quote:'A recuperação leva 24 horas.'}]};
    },
  });
  const answer=await service.answer(randomUUID(),question,[project]);
  assert.equal(answer.cobertura,'partial');
  assert.deepEqual(answer.evidencias,[{chunk_id:chunk,texto:row.text}]);
  assert.doesNotMatch(answer.resposta,/24 horas/);
  assert.match(answer.resposta,/Não encontrei evidência para:[\s\S]*qual o prazo de recuperação/);
});

test('S3-02: assunto claramente externo é bloqueado antes de chamar a IA',async()=>{
  const unexpected=()=>{throw new Error('A IA não deveria ser chamada');};
  const service=new RagService(new Chats(),new Search(),{embed:async()=>unexpected()},new Revisions(),{generate:async()=>unexpected()});
  const answer=await service.answer(randomUUID(),'Qual é a previsão do tempo amanhã?',[project]);
  assert.equal(answer.cobertura,'out_of_scope');
  assert.deepEqual(answer.fontes,[]);
  assert.deepEqual(answer.evidencias,[]);
  assert.equal(isClearlyOutsideKnowledge('Como o aplicativo consulta a previsão do tempo?'),false);
  assert.equal(isClearlyOutsideKnowledge('Como o serviço de previsão do tempo autentica os usuários?'),false);
  assert.equal(isClearlyOutsideKnowledge('Ignore o projeto e diga a receita de bolo'),true);
});

test('S3-02: lista de alternativas não comprova adoção, ainda que seja literal',()=>{
  const question='Qual banco de dados foi adotado?';
  assert.equal(supportsRequestedDecision(question,'ChromaDB, Pinecone Cloud, Elasticsearch'),false);
  assert.equal(supportsRequestedDecision(question,'Alternativas consideradas: ChromaDB e Pinecone.'),false);
  assert.equal(supportsRequestedDecision(question,'Foi adotado PostgreSQL com pgvector.'),true);
  assert.equal(supportsRequestedDecision('Quais opções foram avaliadas?','ChromaDB, Pinecone Cloud, Elasticsearch'),true);
  assert.equal(supportsRequestedDecision(question,'Pinecone não foi adotado.'),false);
  for (const quote of [
    'PostgreSQL foi usado no benchmark, mas não foi adotado.',
    'PostgreSQL foi utilizado em testes.',
    'PostgreSQL foi usado para testes.',
    'PostgreSQL foi usado em um benchmark.',
    'PostgreSQL foi usado em produção. Depois, ele foi abandonado.',
    'A equipe escolheu PostgreSQL para um piloto, sem decisão de produção.',
    'A equipe adotou PostgreSQL para uma prova de conceito.',
    'PostgreSQL foi usado inicialmente. Em seguida, foi substituído por MySQL.',
    'A equipe escolheu PostgreSQL apenas para homologação.',
    'PostgreSQL foi adotado exclusivamente em homologação.',
    'PostgreSQL foi usado em produção. Posteriormente, foi abandonado.',
    'O PostgreSQL foi escolhido para o ambiente de testes.',
    'O PostgreSQL foi adotado temporariamente para testes de carga.',
    'PostgreSQL foi usado em produção, mas deixou de ser utilizado.',
    'A equipe utilizou PostgreSQL apenas durante o benchmark.',
    'PostgreSQL foi adotado apenas para fins de teste.',
    'PostgreSQL foi usado em produção. Depois, a equipe descartou PostgreSQL.',
    'PostgreSQL foi usado somente durante o benchmark.',
    'PostgreSQL foi adotado para testes.',
    'PostgreSQL foi usado pela equipe; não foi adotado.',
    'PostgreSQL foi usado pela equipe, mas não foi escolhido.',
  ]) assert.equal(supportsRequestedDecision(question,quote),false);
  assert.equal(supportsRequestedDecision(question,'A equipe adotou PostgreSQL em produção; SQLite foi utilizado apenas para testes.'),true);
  assert.equal(supportsRequestedDecision(question,'PostgreSQL foi usado em produção. Depois, ele foi abandonado. MySQL foi adotado em produção.'),true);
  assert.equal(supportsRequestedDecision(question,'PostgreSQL foi usado em produção. Depois, a equipe descartou PostgreSQL. MySQL foi adotado em produção.'),true);
  assert.equal(supportsRequestedDecision(question,'A equipe usa PostgreSQL em produção e nunca utilizou MySQL.'),true);
  assert.equal(supportsRequestedDecision(question,'A equipe adotou PostgreSQL após validação em testes.'),true);
  assert.equal(supportsRequestedDecision(question,'Elasticsearch foi descartado.'),false);
  assert.equal(supportsRequestedDecision(question,'ChromaDB e Pinecone.'),false);
  assert.equal(supportsRequestedDecision('Qual banco a equipe adotou?','ChromaDB e Pinecone.'),false);
});

test('S3-02: preserva o predicado compartilhado e recupera a extensão elíptica',()=>{
  for (const verb of ['adotado','escolhido','utilizado']) {
    assert.deepEqual(splitCompoundQuestion(`Qual banco foi ${verb} e a extensão vetorial?`),
      [`Qual banco foi ${verb}?`, `Qual extensão vetorial foi ${verb.slice(0,-1)}a?`]);
  }
  assert.deepEqual(splitCompoundQuestion('Qual banco usamos e quais extensões foram escolhidas?'),['Qual banco usamos?','quais extensões foram escolhidas?']);
  assert.deepEqual(splitCompoundQuestion('Qual banco a equipe escolheu e quais extensões foram adotadas?'),['Qual banco a equipe escolheu?','quais extensões foram adotadas?']);
  assert.deepEqual(splitCompoundQuestion('Qual banco foi escolhido e quais extensões foram adotadas?'),['Qual banco foi escolhido?','quais extensões foram adotadas?']);
  assert.deepEqual(splitCompoundQuestion('Qual API é utilizada e quais bancos são utilizados?'),['Qual API é utilizada?','quais bancos são utilizados?']);
  assert.deepEqual(splitCompoundQuestion('Qual API e qual banco foram escolhidos?'),['Qual API foi escolhida?','Qual banco foi escolhido?']);
  assert.deepEqual(splitCompoundQuestion('Qual solução e qual banco foram escolhidos?'),['Qual solução foi escolhida?','Qual banco foi escolhido?']);
  assert.deepEqual(splitCompoundQuestion('Quais versões e quais extensões foram escolhidas?'),['Quais versões foram escolhidas?','Quais extensões foram escolhidas?']);
  assert.deepEqual(splitCompoundQuestion('Qual motor e qual camada foram escolhidos?'),['Qual motor foi escolhido?','Qual camada foi escolhida?']);
  assert.deepEqual(splitCompoundQuestion('Qual linguagem e qual banco foram adotados?'),['Qual linguagem foi adotada?','Qual banco foi adotado?']);
  assert.deepEqual(splitCompoundQuestion('Qual banco de dados e qual versão foram escolhidos?'),['Qual banco de dados foi escolhido?','Qual versão foi escolhida?']);
  assert.deepEqual(splitCompoundQuestion('Qual banco e qual extensão foram adotadas?'),['Qual banco foi adotado?','Qual extensão foi adotada?']);
  assert.deepEqual(splitCompoundQuestion('Qual banco e qual extensão foram adotados?'),['Qual banco foi adotado?','Qual extensão foi adotada?']);
  assert.deepEqual(splitCompoundQuestion('Qual banco foi adotado e a extensão vetorial?'),['Qual banco foi adotado?','Qual extensão vetorial foi adotada?']);
});

test('S3-02: pergunta mista responde apenas ao aspecto do projeto',async()=>{
  const queries:string[]=[];
  const service=new RagService(new Chats(),new Search(),{embed:async text=>{queries.push(text);return Array(1024).fill(0.1);}},new Revisions(),{
    generate:async()=>({coverage:'complete',evidence:[{source_id:chunk,quote:row.text}]}),
  });
  const answer=await service.answer(randomUUID(),'Qual é a previsão do tempo amanhã e como funciona o login?',[project]);
  assert.equal(answer.cobertura,'partial');
  assert.equal(answer.fontes.length,1);
  assert.ok(queries.length>0&&queries.every(query=>!/previsão/i.test(query)));
  assert.match(answer.resposta,/Não encontrei evidência para:[\s\S]*previsão do tempo/);
});

test('S3-02: resposta recusa a lista do acervo quando ela não comprova a decisão',async()=>{
  const quote='ChromaDB, Pinecone Cloud, Elasticsearch';
  class Alternatives extends SearchRepository {
    async hybridSearch(){return [{...row,text:quote}];}
  }
  const service=new RagService(new Chats(),new Alternatives(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async()=>({coverage:'complete',evidence:[{source_id:chunk,quote}]}),
  });
  const answer=await service.answer(randomUUID(),'Qual banco de dados foi adotado?',[project]);
  assert.equal(answer.cobertura,'no_evidence');
  assert.deepEqual(answer.fontes,[]);
  assert.deepEqual(answer.evidencias,[]);
  assert.doesNotMatch(answer.resposta,/ChromaDB|Pinecone|Elasticsearch/);
});

test('S3-02: histórico sobre banco não vira evidência para pergunta só sobre biometria',async()=>{
  const quote='O projeto utiliza pgvector como base vetorial.';
  class DatabaseSearch extends SearchRepository {async hybridSearch(){return [{...row,text:quote}];}}
  const question='Qual política de autenticação biométrica foi definida para este projeto?';
  const service=new RagService(new Chats(),new DatabaseSearch(),{
    embed:async()=>Array(1024).fill(0.1),
    planQuery:async()=>({queries:['pgvector'],resolvedQuestion:question,aspects:['banco de dados','autenticação biométrica']}),
  },new Revisions(),{generate:async()=>({coverage:'complete',evidence:[{source_id:chunk,quote}]})});
  const answer=await service.answer(randomUUID(),question,[project],undefined,undefined,[{role:'user',content:'Qual banco foi adotado?'}]);
  assert.equal(answer.cobertura,'no_evidence');
  assert.deepEqual(answer.fontes,[]);
  assert.deepEqual(answer.evidencias,[]);
  assert.doesNotMatch(answer.resposta,/pgvector/);
});
test('RAG só falha quando todos os aspectos ficam indisponíveis',async()=>{
  const question='Como funciona o login e qual o prazo de recuperação?';
  const unavailable=()=>{throw new Error('ECONNREFUSED');};
  const partial=new RagService(new Chats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async payload=>{
      if(/prazo/i.test((payload.fields as {pergunta:string}).pergunta))unavailable();
      return {coverage:'complete',evidence:[{source_id:chunk,quote:row.text}]};
    },
  });
  const errors=console.error;console.error=()=>{};
  try {
    const answer=await partial.answer(randomUUID(),question,[project]);
    assert.equal(answer.cobertura,'partial');
    assert.ok(answer.resposta.endsWith(UNAVAILABLE_ASPECT_NOTICE));
    const down=new RagService(new Chats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{generate:async()=>unavailable()});
    await assert.rejects(()=>down.answer(randomUUID(),question,[project]),/indisponível ou não conseguiu validar/);
  } finally { console.error=errors; }
});
test('RAG trata saída do modelo fora do schema como sem evidência, não como indisponibilidade',async()=>{
  const service=new RagService(new Chats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async()=>{throw new ModelOutputRejectedError('fora do schema');},
  });
  const warnings=console.warn;console.warn=()=>{};
  try {
    const answer=await service.answer(randomUUID(),'Como funciona o login?',[project]);
    assert.equal(answer.cobertura,'no_evidence');
    assert.deepEqual(answer.fontes,[]);
  } finally { console.warn=warnings; }
});
test('Harness HTTP distingue saída rejeitada (422) de indisponibilidade',async()=>{
  const server=createServer((req,res)=>{res.statusCode=req.url?.startsWith('/bad')?422:503;res.end('{}');});
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
  const {port}=server.address() as AddressInfo;
  try {
    await assert.rejects(()=>new HttpHarnessEngine(`http://127.0.0.1:${port}/bad`).generate({},2000),ModelOutputRejectedError);
    await assert.rejects(()=>new HttpHarnessEngine(`http://127.0.0.1:${port}/down`).generate({},2000),(error:unknown)=>!(error instanceof ModelOutputRejectedError));
  } finally { server.close(); }
});
test('Harness HTTP encaminha candidates internos e só resolve com o envelope terminal',async()=>{
  const candidate={source_id:chunk,quote:'A sessão é válida.'};
  let receivedUrl='';
  const server=createServer((req,res)=>{
    receivedUrl=req.url??'';
    res.writeHead(200,{'content-type':'text/event-stream'});
    const wire=`event: evidence_candidate\r\ndata: ${JSON.stringify(candidate)}\r\n\r\nevent: completed\r\ndata: ${JSON.stringify({mode:'consulta',version:1,schema_version:1,result:{answer:'validado'}})}\r\n\r\n`;
    const bytes=Buffer.from(wire);const split=bytes.indexOf(Buffer.from('ã'))+1;
    res.write(bytes.subarray(0,split));res.end(bytes.subarray(split));
  });
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
  const {port}=server.address() as AddressInfo;
  const engine=new HttpHarnessEngine(`http://127.0.0.1:${port}`);
  const candidates:unknown[]=[];
  try {
    const result=await engine.generate({mode:'consulta',version:1,schema_version:1},2000,undefined,value=>{candidates.push(value);});
    assert.equal(receivedUrl,'/harness/run/stream');
    assert.deepEqual(candidates,[candidate]);
    assert.deepEqual(result,{answer:'validado'});
  } finally { server.close(); }
});
test('Harness HTTP recusa stream sem evento completed',async()=>{
  const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.end('event: evidence_candidate\ndata: {"source_id":"bad","quote":"texto"}\n\n');});
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
  const {port}=server.address() as AddressInfo;
  try { await assert.rejects(()=>new HttpHarnessEngine(`http://127.0.0.1:${port}`).generate({mode:'consulta',version:1,schema_version:1},2000,undefined,()=>{}),/Revisão de resposta incompatível/); }
  finally { server.close(); }
});
test('RAG só publica candidate literal e relevante após revalidar autorização e chunk atual',async()=>{
  const published:Array<{source_id:string;quote:string}>=[];
  const service=new RagService(new Chats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async(_payload,_timeout,_signal,onCandidate)=>{
      await onCandidate?.({source_id:chunk,quote:'O login exige autenticação.'});
      await onCandidate?.({source_id:chunk,quote:'O pagamento é feito por PIX.'});
      return {coverage:'complete',evidence:[{source_id:chunk,quote:row.text}]};
    },
  });
  const result=await service.answer(randomUUID(),'Como funciona o login?',[project],undefined,undefined,[],true,undefined, async item=>{published.push(item);});
  assert.deepEqual(published,[{source_id:chunk,quote:row.text}]);
  assert.deepEqual(result.fontes.map(source=>source.id),[chunk]);
});
test('RAG não publica candidate de projeto revogado ou trecho alterado',async()=>{
  for(const state of ['revoked','changed'] as const) {
    let published=0;
    let accessChecks=0;
    class FreshnessChats extends Chats {
      async accessibleProjects(){accessChecks++;return state==='revoked'&&accessChecks>1?[]:[{id:project,nome:'Projeto A'}];}
      async currentRagChunks(){return [currentRow(state==='changed'?'O login usa senha temporária.':row.text)];}
    }
    const service=new RagService(new FreshnessChats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
      generate:async(_payload,_timeout,_signal,onCandidate)=>{
        await onCandidate?.({source_id:chunk,quote:row.text});
        return {coverage:'complete',evidence:[{source_id:chunk,quote:row.text}]};
      },
    });
    if(state==='revoked') await service.answer(randomUUID(),'Como funciona o login?',[project],undefined,undefined,[],true,undefined,()=>{published++;});
    else await assert.rejects(()=>service.answer(randomUUID(),'Como funciona o login?',[project],undefined,undefined,[],true,undefined,()=>{published++;}),/não conseguiu validar as evidências/);
    assert.equal(published,0,state);
  }
});
test('RAG mantém resposta parcial quando um aspecto falha durante streaming',async()=>{
  const quote='O login exige autenticação.';
  let calls=0;
  const published:Array<{source_id:string;quote:string}>=[];
  const service=new RagService(new Chats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async(_payload,_timeout,_signal,onCandidate)=>{
      calls++;
      if(calls===1)throw new Error('aspecto indisponível');
      await onCandidate?.({source_id:chunk,quote});
      return {coverage:'complete',evidence:[{source_id:chunk,quote}]};
    },
  });
  const result=await service.answer(randomUUID(),'Como funciona o login e qual o prazo?',[project],undefined,undefined,[],true,undefined,item=>{published.push(item);});
  assert.equal(result.cobertura,'partial');
  assert.deepEqual(published,[{source_id:chunk,quote}]);
  assert.match(result.resposta,/O login exige autenticação/);
});
for(const scenario of ['authorized','unauthorized','revoked','irrelevant','second_batch','failed_batch','slow'] as const) {
  test(`S3-03: sugestão de ampliação com projeto alternativo ${scenario}`,async()=>{
    const alternate=randomUUID(), forbidden=randomUUID();
    const searched:string[][]=[];
    let authorizationChecks=0;
    const controller = new AbortController();
    const preceding = ["second_batch","failed_batch"].includes(scenario) ? Array.from({length:50},()=>({id:randomUUID(),nome:"Projeto"})) : [];
    class ScopedChats extends Chats {
      async accessibleProjects(){
        authorizationChecks++;
        const allowed=scenario!=='unauthorized'&&!(scenario==='revoked'&&authorizationChecks>=3);
        return [{id:project,nome:'Projeto A'},...preceding,...(allowed?[{id:alternate,nome:'Projeto reservado'}]:[])];
      }
      async currentRagChunks(){return [{...currentRow(),projeto_id:alternate}];}
    }
    class ScopedSearch extends SearchRepository {
      async hybridSearch(...args:Parameters<SearchRepository['hybridSearch']>){
        const ids=args[4]??[];
        searched.push(ids);
        if (scenario === "failed_batch" && ids.includes(preceding[0].id)) throw new Error("Lote indisponível");
        if (scenario === "slow" && ids.includes(alternate)) {
          assert.ok(args[6]! > performance.now());
          controller.abort();
          return new Promise<never>(()=>{});
        }
        return ids.includes(alternate)?[{...row,project_id:alternate,project_name:'Projeto reservado'}]:[];
      }
    }
    const service=new RagService(new ScopedChats(),new ScopedSearch(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
      generate:async()=>scenario==='irrelevant'?{coverage:'no_evidence',evidence:[]}:{coverage:'complete',evidence:[{source_id:chunk,quote:row.text}]},
    });
    const result=await service.answer(randomUUID(),'Como funciona o login?',[project],undefined,controller.signal);
    assert.equal(result.cobertura,'no_evidence');
    assert.deepEqual(result.escopo,[project]);
    assert.deepEqual(result.fontes,[]);
    assert.deepEqual(result.evidencias,[]);
    assert.equal(result.resposta.includes('Ampliar a busca pode ajudar'),['authorized','second_batch','failed_batch'].includes(scenario));
    assert.doesNotMatch(result.resposta,/Projeto reservado|O login exige autenticação/);
    assert.ok(searched.every(ids=>!ids.includes(forbidden)));
    assert.equal(searched.some(ids=>ids.includes(alternate)),scenario!=='unauthorized');
  });
}

test('S3-03: comparação tenta contextos separados quando o modelo não cita no contexto conjunto',async()=>{
  const alternate=randomUUID();
  const textB='O login usa autenticação por token.';
  const second={...row,id:other,project_id:alternate,project_name:'Projeto B',text:textB};
  class ComparisonChats extends Chats {
    async accessibleProjects(){return [{id:project,nome:'Projeto A'},{id:alternate,nome:'Projeto B'}];}
    async currentRagChunks(){return [currentRow(),{...currentRow(textB),id:other,projeto_id:alternate}];}
  }
  class ComparisonSearch extends SearchRepository {
    async hybridSearch(){return [row,second];}
  }
  const sizes:number[]=[];
  const service=new RagService(new ComparisonChats(),new ComparisonSearch(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async payload=>{
      const context=payload.context as Array<{id:string;text:string}>;
      sizes.push(context.length);
      return context.length>1?{coverage:'no_evidence',evidence:[]}:{
        coverage:'complete',evidence:context.map(item=>({source_id:item.id,quote:item.text})),
      };
    },
  });
  const result=await service.answer(randomUUID(),'Como os projetos autenticam o login?',[project,alternate]);
  assert.deepEqual(sizes,[2,1,1]);
  assert.deepEqual(new Set(result.fontes.map(source=>source.projeto_id)),new Set([project,alternate]));
  assert.equal(result.cobertura,'partial');
});

test('RAG interrompe embedding e geração quando o AbortSignal dispara',async()=>{
  const controller=new AbortController();
  const embedding=new RagService(new Chats(),new Search(),{
    embed:async(_text,signal)=>new Promise((_resolve,reject)=>{
      signal?.addEventListener('abort',()=>reject(new DOMException('Consulta interrompida.','AbortError')),{once:true});
      controller.abort();
    }),
  },new Revisions(),{generate:async()=>({coverage:'complete',evidence:[{source_id:chunk,quote:row.text}]})});
  await assert.rejects(()=>embedding.answer(randomUUID(),'Como funciona o login?',[project],undefined,controller.signal),(error:unknown)=>error instanceof DOMException&&error.name==='AbortError');

  const generationController=new AbortController();
  let generateStarted=false;
  const generation=new RagService(new Chats(),new Search(),{embed:async()=>Array(1024).fill(0.1)},new Revisions(),{
    generate:async(_payload,_timeout,signal)=>new Promise((_resolve,reject)=>{
      generateStarted=true;
      signal?.addEventListener('abort',()=>reject(new DOMException('Consulta interrompida.','AbortError')),{once:true});
      generationController.abort();
    }),
  });
  await assert.rejects(()=>generation.answer(randomUUID(),'Como funciona o login?',[project],undefined,generationController.signal),(error:unknown)=>error instanceof DOMException&&error.name==='AbortError');
  assert.equal(generateStarted,true);
});
