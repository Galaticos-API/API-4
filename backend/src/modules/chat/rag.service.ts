import { randomUUID } from 'node:crypto';
import { EvidenceEngine, validateEvidence, wholePassage, escapeMarkdown } from './rag-evidence.js';
export { validateEvidence,validateEvidenceResponse,evidenceOutputSchema } from './rag-evidence.js';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError,NotFoundError,ValidationError } from '../../shared/errors.js';
import { HarnessService,HttpHarnessEngine,type HarnessEngine } from '../harness/harness.service.js';
import { HarnessRepository } from '../harness/harness.repository.js';
import { SearchRepository } from '../search/search.repository.js';
import { fallbackSearchQuery,HttpSearchEmbeddingClient,type SearchEmbeddingClient } from '../search/search.service.js';
import type { HybridSearchRow } from '../search/search.types.js';
import { ChatRepository } from './chat.repository.js';
import { NO_SUPPORT_ANSWER,NOT_FOUND_ANSWER,OUT_OF_SCOPE_ANSWER,PARTIAL_ANSWER_NOTICE,SCOPE_LIMIT_ANSWER,UNAVAILABLE_ASPECT_NOTICE,validChatText,type AssistantAnswer,type ChatProgressStage,type ChatSource,type ConversationTurn } from './chat.types.js';

export const ragInput=z.object({pergunta:z.string().trim().min(1).max(2000).refine(validChatText,'Use texto Unicode válido, sem caractere nulo.'),projeto_ids:z.array(z.string().uuid().transform(id=>id.toLowerCase())).min(1).max(50).optional()}).strict();
type RagFailureStage = 'embedding' | 'hybrid_search' | 'context_build' | 'harness' | 'source_revalidation' | 'response_assembly';

const RAG_FAILURE_CODES: Record<RagFailureStage, string> = {
  embedding: 'RAG_EMBEDDING_FAILED',
  hybrid_search: 'RAG_RETRIEVAL_FAILED',
  context_build: 'RAG_CONTEXT_FAILED',
  harness: 'RAG_HARNESS_FAILED',
  source_revalidation: 'RAG_EVIDENCE_REVALIDATION_FAILED',
  response_assembly: 'RAG_RESPONSE_ASSEMBLY_FAILED',
};

function diagnosticIdFrom(error: unknown, fallback: string): string {
  if (!(error instanceof AppError) || typeof error.details !== 'object' || error.details === null) return fallback;
  const candidate = (error.details as Record<string, unknown>).diagnostico_id;
  return typeof candidate === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : fallback;
}

export function usedSources(rows:HybridSearchRow[],evidence:ReturnType<typeof validateEvidence>):ChatSource[] {
  const sources=new Map<string,ChatSource>();
  for(const item of evidence) {
    const row=rows.find(row=>row.id===item.source_id)!;
    const key=`${row.project_id}:${row.entity_type}:${row.entity_id}`;
    const existing=sources.get(key);
    if(existing){if(!existing.chunk_ids!.includes(row.id))existing.chunk_ids!.push(row.id);continue;}
    const title=row.entity_type==='analise_repositorio'?`Relatório de IA revisado ${row.title??''} · execução ${String(row.metadata?.run_id??row.entity_id)}`:row.title??'Fonte do acervo';
    sources.set(key,{id:row.id,titulo:title,tipo:row.entity_type,projeto_id:row.project_id,
      projeto_nome:row.project_name,entidade_id:row.entity_id,url:row.source_url,chunk_ids:[row.id]});
  }
  return [...sources.values()];
}

function projectOverviewEvidence(rows:HybridSearchRow[]):Array<{source_id:string;quote:string}> {
  const evidence:Array<{source_id:string;quote:string}>=[];
  for(const row of rows) for(const paragraph of row.text.split(/\n\s*\n/u).map(value=>value.trim())) {
    if(!paragraph||/^#{1,6}\s/u.test(paragraph)||/^as respostas devem usar somente os trechos desta base/iu.test(paragraph))continue;
    const passages=paragraph.length<=1000?[paragraph]:paragraph.split(/(?<=[.!?])\s+(?=[\p{Lu}])/u);
    for(const quote of passages.map(value=>value.trim()).filter(value=>value.length<=1000&&wholePassage(row.text,value))) {
      if(!evidence.some(item=>item.quote===quote))evidence.push({source_id:row.id,quote});
      if(evidence.length===5)return evidence;
    }
  }
  return evidence;
}

function fuseQueryResults(results:HybridSearchRow[][],limit=5):HybridSearchRow[] {
  const fused=new Map<string,{row:HybridSearchRow;score:number}>();
  for(const rows of results) rows.forEach((row,index)=>{
    const current=fused.get(row.id)??{row,score:0};
    current.score+=1/(60+index+1);
    fused.set(row.id,current);
  });
  return [...fused.values()].sort((a,b)=>b.score-a.score||a.row.id.localeCompare(b.row.id)).slice(0,limit).map(item=>item.row);
}

function isProjectOverviewQuestion(question:string):boolean {
  const asksForOverview=/\b(?:resuma|resumir|resumo|fale|fala|conte|conta|descreva|descreve|explique|explica|vis[aã]o geral|panorama)\b/iu.test(question);
  const namesProjectKnowledge=/\b(?:projeto|acervo|documento|cen[aá]rio|base)\b/iu.test(question);
  return asksForOverview&&namesProjectKnowledge;
}

export function splitCompoundQuestion(question:string):string[] {
  const clean=question.trim();
  const hadQuestionMark=/\?\s*$/u.test(clean);
  const parts=clean.replace(/[?!.]+\s*$/u,'').split(/(?:\s+e\s+|[?.;,]\s*)(?=(?:qual|quais|quem|como|quando|onde|por que|porque|para que|quanto|quantos|quantas|o que|também)\b)/iu)
    .map(part=>part.trim().replace(/^[,;:\s]+|[,;:\s]+$/gu,''))
    .filter(part=>part.length>=3);
  if(parts.length===1) {
    const elliptical=parts[0].match(/^(qual\s+.+?\s+(foi|é)\s+((?:adotad|escolhid|utilizad)[oa]))\s+e\s+[oa]\s+(extens[aã]o\s+vetorial)$/iu);
    if(elliptical)return [`${elliptical[1]}?`,`Qual ${elliptical[4]} ${elliptical[2]} ${elliptical[3].slice(0,-1)}a?`];
  }
  if(parts.length<2||parts.length>3)return [clean];
  const shared=parts[parts.length-1].match(/\s+((?:foram|foram mesmo|são)\s+(?:adotad|escolhid|utilizad)[oa]s)$/iu);
  if(shared&&parts.slice(0,-1).every(part=>!/(?:^|\s)(?:foi|foram|é|são|escolheu|escolheram|adotou|adotaram|utilizou|utilizaram|usamos|utilizamos|adotamos|escolhemos)(?=\s|$)/iu.test(part)&&/^(?:qual|quais)\s+\S+(?:\s+\S+){0,4}$/iu.test(part))) {
    const present = /^são\s/iu.test(shared[1]);
    const participle = shared[1].split(/\s+/u).at(-1)!;
    return parts.map((part,index)=>{
      const subject = index===parts.length-1 ? part.slice(0,-shared[0].length) : part;
      const plural = /^quais\s/iu.test(subject);
      const noun = subject.split(/\s+/u)[1];
      const gender = /^(?:extens(?:ão|ões)|vers(?:ão|ões)|apis?|solu(?:ção|ções)|camadas?|linguage(?:m|ns)|tecnologias?|bases?|ferramentas?|bibliotecas?|plataformas?)$/iu.test(noun)
        ? 'a' : /^(?:bancos?|sistemas?|frameworks?|modelos?)$/iu.test(noun) ? 'o' : participle.slice(-2,-1);
      const auxiliary = present ? (plural?'são':'é') : (plural?'foram':'foi');
      return `${subject[0].toUpperCase()}${subject.slice(1)} ${auxiliary} ${participle.slice(0,-2)}${gender}${plural?'s':''}${hadQuestionMark?'?':''}`;
    });
  }
  return parts.map(part=>hadQuestionMark?`${part}?`:part);
}

export function formatVerifiedEvidence(evidence:ReturnType<typeof validateEvidence>):string {
  if(evidence.length===1)return `Trecho literal encontrado no acervo: ${escapeMarkdown(evidence[0].quote)} [${evidence[0].source_id}]`;
  return `Trechos literais encontrados no acervo:\n\n${evidence.map(item=>`- ${escapeMarkdown(item.quote)} [${item.source_id}]`).join("\n")}`;
}

export function isClearlyOutsideKnowledge(question:string):boolean {
  const generalTopic=/\b(?:previs[aã]o do tempo|(?:vai|deve) chover|receita de bolo|(?:fazer|assar) p[ãa]o caseiro|resultado do jogo|quem ganhou a partida|hor[oó]scopo|meu signo|a capital d[aoe]|placar da final|cota[çc][ãa]o do d[oó]lar|signo de|receita de p[ãa]o caseiro|clima de amanh[ãa])(?![\p{L}\p{N}_])/iu;
  const workContext=/\b(?:projeto|acervo|documento|requisito|aplicativo|sistema|api|funcionalidade|m[oó]dulo|tela|componente|painel|widget|servi[çc]o|autentica\w*|integra[çc][ãa]o)\b/iu;
  if(/\b(?:ignore|esque[çc]a)\b[^.!?]*\b(?:e diga|e explique|e me d[eê]|e responda)\b/iu.test(question))return generalTopic.test(question);
  return generalTopic.test(question)&&!workContext.test(question);
}

export function supportsRequestedDecision(question:string,quote:string):boolean {
  if(!/\b(?:adotad[oa]s?|adotou|adotaram|escolhid[oa]s?|escolheu|escolheram|utilizad[oa]s?|utilizou|utilizaram)\b/iu.test(question))return true;
  if(/^\s*(?:alternativas|op[çc][õo]es|tecnologias)\s+(?:avaliadas|consideradas|descartadas)\s*:/iu.test(quote))return false;
  // A list of names alone does not establish which option was adopted.
  const asksForDatabase=/\bbanco(?: de dados)?\b/iu.test(question);
  const reversedDecision = /(?:^|(?<=[.!?;]))[^.!?;]*\b(postgresql|mysql|mariadb|sqlite|mongodb|sql server|oracle database|cockroachdb|firebird|db2)\b[^.!?;]*[.!?;]\s*(?:depois|posteriormente)\b[^.!?;]*\b(?:descartou|rejeitou|abandonou)\s+(?:o\s+)?\1\b/giu;
  quote = quote.replace(/\b(?:usad[oa]|utilizad[oa]|adotad[oa]|escolhid[oa])\b[^.!?;]*[.!?;]\s*(?:depois|posteriormente|em seguida),?\s+(?:(?:ele|ela)\s+)?(?:foi|foram)\s+(?:abandonad[oa]s?|descartad[oa]s?|rejeitad[oa]s?|substitu[ií]d[oa]s?)\b/iu, "");
  if (asksForDatabase) quote = quote.replace(reversedDecision, "");
  return quote.split(/\n+|\s+e\s+(?=nunca\s+(?:usou|utilizou|adotou|escolheu)\s+\S)|;(?!\s*n[aã]o\s+(?:(?:foi|foram)\s+)?(?:adot|escolh|utiliz|usad))|(?<=[.!?])\s+|(?:,\s*mas\s+|\s+e\s+)(?=n[aã]o\b(?!\s+(?:(?:foi|foram)\s+)?(?:adot|escolh|utiliz|usad)))/iu).some(clause=>{
    if (/\b(?:apenas|somente|exclusivamente)\s+(?:(?:durante|no|em|para)\s+(?:(?:o|a|um|uma)\s+)?(?:benchmarks?|testes?|prot[oó]tipos?|homologa[çc][ãa]o)|para fins de testes?|para homologa[çc][ãa]o)\b/iu.test(clause)) return false;
    if(/\b(?:n[aã]o|nunca|nem|descart\w*|rejeit\w*|descontinu\w*|substitu[ií]d\w*|pode|poderia|pretend\w*|cogit\w*|recomend\w*|planej\w*|estud\w*|(?:apenas|somente|exclusivamente)\s+(?:para testes|(?:no|em) ambiente de testes?)|(?:apenas|somente|exclusivamente)\s+(?:no|em)\s+(?:prot[oó]tipo|benchmark|laborat[oó]rio)|(?:usad[oa]s?|utilizad[oa]s?|adotad[oa]s?|escolhid[oa]s?)\s+(?:(?:somente|apenas|exclusivamente|temporariamente)\s+)?(?:no|em|para|durante)\s+(?:(?:um|uma|o|a)\s+)?(?:benchmarks?|testes?|ambiente de testes?|prot[oó]tipos?)|deixou de ser (?:utilizad[oa]|usad[oa])|para reproduzir (?:um )?incidente em laborat[oó]rio|para\s+(?:(?:um|o)\s+)?piloto|para\s+(?:uma\s+)?prova de conceito|como alternativa|sugest[aã]o|consider\w*|avali\w*|ainda|ser[aá]|se aprovado)\b/iu.test(clause))return false;
    if(asksForDatabase&&(!/\b(?:banco|postgresql|mysql|mariadb|sqlite|mongodb|sql server|oracle database|cockroachdb|firebird|db2)\b/iu.test(clause)
      || /\b(?:para cache|como cache)\b/iu.test(clause)))return false;
    return /\b(?:ado[çc][ãa]o|adot\w*|utiliz\w*|escolh\w*|decid\w*|usa|usamos|usado|usada|em uso)\b/iu.test(clause)
      || (asksForDatabase&&/(?:^|\s)(?:é\s+o\s+banco de dados|o banco de dados\s+é)\s+/iu.test(clause));
  });
}

export class RagService {
  constructor(private readonly chats=new ChatRepository(),private readonly search=new SearchRepository(),
    private readonly embeddings:SearchEmbeddingClient=new HttpSearchEmbeddingClient(),
    private readonly revisions=new HarnessRepository(),private readonly engine:HarnessEngine=new HttpHarnessEngine()){}

  async answer(userId:string,question:string,requestedProjects?:string[],onProgress?:(stage:ChatProgressStage)=>void,signal?:AbortSignal,history:ConversationTurn[] = []) {
    const parsed=ragInput.safeParse({pergunta:question,...(requestedProjects?{projeto_ids:requestedProjects}:{})});
    if(!parsed.success)throw new ValidationError('Pergunta ou escopo inválido.');
    requestedProjects=parsed.data.projeto_ids;
    const accessible=await this.chats.accessibleProjects(userId);
    if(requestedProjects?.some(id=>!accessible.some(project=>project.id===id)))throw new NotFoundError('Projeto não encontrado.');
    const projectIds=[...new Set(requestedProjects??accessible.map(project=>project.id))];
    const empty={contrato:'rag-conversacional-v1',resposta:NOT_FOUND_ANSWER,fontes:[] as ChatSource[],evidencias:[] as Array<{chunk_id:string;texto:string}>,escopo:projectIds,cobertura:'no_evidence' as const};
    const originalAspects=splitCompoundQuestion(parsed.data.pergunta);
    if(originalAspects.every(isClearlyOutsideKnowledge))return {...empty,resposta:OUT_OF_SCOPE_ANSWER,cobertura:'out_of_scope' as const};
    if(!projectIds.length)return empty;
    const diagnosticId=randomUUID();
    const startedAt=performance.now();
    const durations:Record<string,number>={};
    const finishLog=(resultCount:number,sourceCount=0)=>console.info('[RAG] Request completed',{
      diagnostico_id:diagnosticId,
      duracao_total_ms:Math.round(performance.now()-startedAt),
      duracoes_ms:durations,
      resultados_recuperados:resultCount,
      fontes_utilizadas:sourceCount,
    });
    const reportProgress=(progressStage:ChatProgressStage)=>{try{onProgress?.(progressStage);}catch{/* A conexão do cliente não deve interromper o RAG. */}};
    let stage:RagFailureStage='embedding';
    try {
      reportProgress('searching');
      let stageStarted=performance.now();
      if(signal?.aborted)throw new DOMException("Consulta interrompida.","AbortError");
      const overviewRequest=isProjectOverviewQuestion(parsed.data.pergunta);
      const queryPlan=overviewRequest
        ? {queries:[],resolvedQuestion:parsed.data.pergunta,aspects:[parsed.data.pergunta]}
        : this.embeddings.planQuery
        ? await this.embeddings.planQuery(parsed.data.pergunta,signal,history)
        : {queries:[fallbackSearchQuery(parsed.data.pergunta)],resolvedQuestion:parsed.data.pergunta,aspects:[parsed.data.pergunta]};
      const resolvedQuestion=queryPlan.resolvedQuestion.trim().slice(0,2000)||parsed.data.pergunta;
      const plannedAspects=[...new Set((queryPlan.aspects??[resolvedQuestion]).map(aspect=>aspect.trim().slice(0,500)).filter(aspect=>aspect.length>=3))].slice(0,3);
      const deterministicAspects=splitCompoundQuestion(resolvedQuestion);
      // Use the deterministic split for explicit compound questions. Planner aspects
      // are useful for follow-ups, but a model can return the right count in the
      // wrong order or with different wording, breaking the aspect-to-search mapping.
      const aspects=overviewRequest?[resolvedQuestion]:originalAspects.length>1?originalAspects:deterministicAspects.length>1?deterministicAspects:plannedAspects;
      const safeAspects=aspects.length?aspects:[resolvedQuestion];
      const mixedScope=safeAspects.some(isClearlyOutsideKnowledge);
      const searchQueries=[...new Set((mixedScope?safeAspects.filter(aspect=>!isClearlyOutsideKnowledge(aspect)):[parsed.data.pergunta,...queryPlan.queries,...safeAspects])
        .map(query=>query.trim()).filter(query=>query.length>=3)
        .filter((query,index,all)=>all.findIndex(item=>item.toLocaleLowerCase('pt-BR')===query.toLocaleLowerCase('pt-BR'))===index))].slice(0,6);
      durations.interpretacao_pergunta=Math.round(performance.now()-stageStarted);
      stageStarted=performance.now();
      const vectors=await Promise.all(searchQueries.map(query=>this.embeddings.embed(query,signal)));
      durations.embedding=Math.round(performance.now()-stageStarted);
      if(vectors.some(vector=>!Array.isArray(vector)||vector.length!==1024||vector.some(value=>!Number.isFinite(value))||vector.every(value=>value===0)))throw Error('Embedding incompatível');
      stage='hybrid_search';
      if(signal?.aborted)throw new DOMException("Consulta interrompida.","AbortError");
      stageStarted=performance.now();
      const resultSets=await Promise.all(searchQueries.map((query,index)=>this.search.hybridSearch(
        {query,projectId:projectIds[0],limit:5},vectors[index],env.SEARCH_MIN_VECTOR_SIMILARITY,env.SEARCH_MIN_TEXT_RANK,projectIds)));
      let rows=fuseQueryResults(resultSets);
      if(!rows.length&&overviewRequest) {
        stageStarted=performance.now();
        rows=await this.search.ragSearch(projectIds,vectors[0],5,-1);
        durations.busca_hibrida+=Math.round(performance.now()-stageStarted);
      }
      const aspectRows=safeAspects.map(aspect=>{
        const index=searchQueries.findIndex(query=>query.toLocaleLowerCase('pt-BR')===aspect.toLocaleLowerCase('pt-BR'));
        return index>=0?fuseQueryResults([resultSets[index]]):[];
      });
      durations.busca_hibrida=Math.round(performance.now()-stageStarted);
      if(!rows.length){finishLog(0);return empty;}
      if(rows.some(row=>!projectIds.includes(row.project_id)))throw Error('Escopo incompatível');
      stage='context_build';
      let remaining=20000;
      const overviewEvidence=overviewRequest?projectOverviewEvidence(rows):[];
      const facetContexts=overviewRequest?[]:aspectRows.map((facetRows,index)=>{
        const eligible=facetRows.length?facetRows:(safeAspects.length===1?rows:[]);
        return eligible.flatMap(row=>{
        const text=row.text.slice(0,Math.min(8000,remaining));remaining-=text.length;
        return text.trim()?[{id:row.id,text}]:[];
        });
      });
      if(!overviewRequest&&!facetContexts.some(context=>context.length)){finishLog(rows.length);return {...empty,resposta:`${NO_SUPPORT_ANSWER} ${SCOPE_LIMIT_ANSWER}`};}
      stage='harness';
      reportProgress('synthesizing');
      stageStarted=performance.now();
      const selections:Array<{aspect:string;adapter:EvidenceEngine}> = [];
      // Cada aspecto falha sozinho: citação inválida vira "sem evidência" dentro do EvidenceEngine,
      // e indisponibilidade de um aspecto só derruba o chat quando todos os aspectos falham.
      let failedAspects=0,lastFailure:unknown;
      let hasCoverageConflict=false;
      for (const [index,context] of facetContexts.entries()) {
        if (!context.length) continue;
        const adapter=new EvidenceEngine(this.engine);
        try {
          await new HarnessService(this.revisions,adapter,this.chats).run(projectIds[0],
            {mode:'consulta',operation:'responder',level:'pbi',fields:{pergunta:safeAspects.length===1?resolvedQuestion:safeAspects[index]},context:[]},context,diagnosticId,signal);
        } catch(error) {
          if(signal?.aborted)throw error;
          failedAspects++;lastFailure=error;
          continue;
        }
        const requestedAspect=originalAspects.length===1?originalAspects[0]:safeAspects[index];
        const asksForBiometrics=/\bbiom[eé]tr\w*\b/iu.test(requestedAspect);
        const supported=adapter.evidence.filter(item=>supportsRequestedDecision(safeAspects[index],item.quote)
          && (!asksForBiometrics || /\b(?:biom[eé]tr\w*|impress[ãa]o digital|reconhecimento facial|reconhecimento de [ií]ris)\b/iu.test(item.quote)));
        if(supported.length!==adapter.evidence.length) {
          adapter.evidence=supported;
          adapter.coverage=supported.length?'partial':'no_evidence';
        }
        if(!adapter.evidence.length&&!asksForBiometrics
          && /\bbanco(?: de dados)?\b/iu.test(requestedAspect)
          && /\b(?:adotad[oa]|adotou|escolhid[oa]|escolheu)\b/iu.test(requestedAspect)) {
          for(const source of aspectRows[index].filter(row=>row.entity_type==='decisao')) {
            const quote=context.find(item=>item.id===source.id)?.text.split('\n')[0].trim();
            if(!quote||quote.length>1000||!/^Título:\s+Adoção de\b/iu.test(quote)
              || !/\b(?:PostgreSQL|MySQL|MariaDB|SQLite|MongoDB|SQL Server|Oracle Database)\b/iu.test(quote)
              || !wholePassage(source.text,quote))continue;
            adapter.evidence=[{source_id:source.id,quote}];
            adapter.coverage='partial';
            break;
          }
        }
        if(adapter.outcome!=='accepted')console.warn('[RAG] Evidence adjusted',{diagnostico_id:diagnosticId,aspecto:index,resultado:adapter.outcome,citacoes_validas:adapter.evidence.length});
        hasCoverageConflict ||= adapter.coverageConflict&&adapter.evidence.length>0;
        selections.push({aspect:safeAspects[index],adapter});
      }
      if(!selections.length&&failedAspects)throw lastFailure;
      const notice=failedAspects?UNAVAILABLE_ASPECT_NOTICE:hasCoverageConflict
        ?'Encontrei trechos literais no acervo, mas não consegui confirmar se respondem a todos os pontos. Confira as fontes citadas.'
        :PARTIAL_ANSWER_NOTICE;
      const selectedEvidence=overviewRequest?overviewEvidence:selections.flatMap(selection=>selection.adapter.evidence)
        .filter((item,index,all)=>all.findIndex(other=>other.source_id===item.source_id&&other.quote===item.quote)===index).slice(0,5);
      const evidenceCoverage:NonNullable<AssistantAnswer['cobertura']> = overviewRequest
        ? selectedEvidence.length?'complete':'no_evidence'
        : hasCoverageConflict
        ?'partial'
        : selections.length===safeAspects.length
        ? (selections.every(selection=>selection.adapter.evidence.length>0)
          ? (selections.some(selection=>selection.adapter.coverage==='partial')?'partial':'complete')
          : (selectedEvidence.length?'partial':selections.some(selection=>selection.adapter.coverage==='out_of_scope')?'out_of_scope':'no_evidence'))
        : selectedEvidence.length?'partial':selections.some(selection=>selection.adapter.coverage==='out_of_scope')?'out_of_scope':'no_evidence';
      durations.geracao_e_validacao_harness=Math.round(performance.now()-stageStarted);
      if(!selectedEvidence.length){
        finishLog(rows.length);
        return {...empty,resposta:overviewRequest?NOT_FOUND_ANSWER:evidenceCoverage==='out_of_scope'?OUT_OF_SCOPE_ANSWER:failedAspects?`${NO_SUPPORT_ANSWER} ${UNAVAILABLE_ASPECT_NOTICE}`:`${NO_SUPPORT_ANSWER} ${SCOPE_LIMIT_ANSWER}`,cobertura:evidenceCoverage};
      }
      stage='source_revalidation';
      reportProgress('validating');
      stageStarted=performance.now();
      const current=await this.chats.currentRagChunks(userId,selectedEvidence.map(item=>item.source_id));
      durations.revalidacao_fontes=Math.round(performance.now()-stageStarted);
      if(selectedEvidence.some(item=>{
        const source=rows.find(row=>row.id===item.source_id)!;
        const latest=current.find(row=>row.id===item.source_id);
        return !latest||latest.projeto_id!==source.project_id||latest.entidade_tipo!==source.entity_type
          ||latest.entidade_id!==source.entity_id||latest.texto!==source.text
          ||JSON.stringify(latest.metadados_json??{})!==JSON.stringify(source.metadata??{})
          ||!wholePassage(latest.texto,item.quote);
      }))throw Error('Fonte alterada, indisponível ou passagem incompleta');
      stage='response_assembly';
      reportProgress('synthesizing');
      stageStarted=performance.now();
      let verifiedAnswer=formatVerifiedEvidence(selectedEvidence);
      if(projectIds.length>1) verifiedAnswer=verifiedAnswer.replace(/(\[[0-9a-f-]{36}\])/gi,match=>{
        const evidence=selectedEvidence.find(item=>match.toLowerCase()===`[${item.source_id.toLowerCase()}]`);
        const source=evidence&&rows.find(row=>row.id===evidence.source_id);
        return source?`${escapeMarkdown(source.project_name)} ${match}`:match;
      });
      durations.montagem_resposta=Math.round(performance.now()-stageStarted);
      const missing=safeAspects.length>1?safeAspects.filter(aspect=>!selections.some(selection=>selection.aspect===aspect&&selection.adapter.evidence.length)): [];
      const missingNotice=missing.length&&!failedAspects
        ? `\n\nNão encontrei evidência para:\n${missing.map(aspect=>`- ${escapeMarkdown(aspect.replace(/\s+/gu,' '))}`).join('\n')}`
        : '';
      const answer=evidenceCoverage==='partial'?`${verifiedAnswer}\n\n${notice}${missingNotice}`:verifiedAnswer;
      const sources=usedSources(rows,selectedEvidence);
      finishLog(rows.length,sources.length);
      return {...empty,resposta:answer,fontes:sources,cobertura:evidenceCoverage,
        evidencias:selectedEvidence.map(item=>({chunk_id:item.source_id,texto:item.quote}))};
    } catch (error) {
      if(signal?.aborted)throw new DOMException("Consulta interrompida.","AbortError");
      const requestId=diagnosticIdFrom(error,diagnosticId);
      const harnessAlreadyLogged=error instanceof AppError && error.code==='AI_HARNESS_UNAVAILABLE'
        && requestId===diagnosticId;
      if(!harnessAlreadyLogged) console.error('[RAG] Request failed',{
        diagnostico_id:requestId,
        etapa:stage,
        codigo:RAG_FAILURE_CODES[stage],
        duracao_ms:Math.round(performance.now()-startedAt),
        duracoes_ms:durations,
      });
      throw new AppError('O assistente está indisponível ou não conseguiu validar as evidências. Sua pergunta foi preservada.',503,'RAG_UNAVAILABLE',{diagnostico_id:requestId});
    }
  }
}
