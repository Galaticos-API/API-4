import { randomUUID } from 'node:crypto';
import { EvidenceEngine, validateEvidence, wholePassage, escapeMarkdown } from './rag-evidence.js';
export { validateEvidence, evidenceOutputSchema } from './rag-evidence.js';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError,NotFoundError,ValidationError } from '../../shared/errors.js';
import { HarnessService,HttpHarnessEngine,type HarnessEngine } from '../harness/harness.service.js';
import { HarnessRepository } from '../harness/harness.repository.js';
import { SearchRepository } from '../search/search.repository.js';
import { HttpSearchEmbeddingClient,type SearchEmbeddingClient } from '../search/search.service.js';
import type { HybridSearchRow } from '../search/search.types.js';
import { ChatRepository } from './chat.repository.js';
import { NOT_FOUND_ANSWER,validChatText,type ChatSource } from './chat.types.js';

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

export class RagService {
  constructor(private readonly chats=new ChatRepository(),private readonly search=new SearchRepository(),
    private readonly embeddings:SearchEmbeddingClient=new HttpSearchEmbeddingClient(),
    private readonly revisions=new HarnessRepository(),private readonly engine:HarnessEngine=new HttpHarnessEngine()){}

  async answer(userId:string,question:string,requestedProjects?:string[]) {
    const parsed=ragInput.safeParse({pergunta:question,...(requestedProjects?{projeto_ids:requestedProjects}:{})});
    if(!parsed.success)throw new ValidationError('Pergunta ou escopo inválido.');
    requestedProjects=parsed.data.projeto_ids;
    const accessible=await this.chats.accessibleProjects(userId);
    if(requestedProjects?.some(id=>!accessible.some(project=>project.id===id)))throw new NotFoundError('Projeto não encontrado.');
    const projectIds=[...new Set(requestedProjects??accessible.map(project=>project.id))];
    const empty={contrato:'rag-extrativo-v1',resposta:NOT_FOUND_ANSWER,fontes:[] as ChatSource[],evidencias:[] as Array<{chunk_id:string;texto:string}>,escopo:projectIds};
    if(!projectIds.length)return empty;
    const diagnosticId=randomUUID();
    const startedAt=performance.now();
    let stage:RagFailureStage='embedding';
    try {
      const vector=await this.embeddings.embed(parsed.data.pergunta);
      if(!Array.isArray(vector)||vector.length!==1024||vector.some(value=>!Number.isFinite(value))||vector.every(value=>value===0))throw Error('Embedding incompatível');
      stage='hybrid_search';
      const rows=await this.search.hybridSearch({query:parsed.data.pergunta,projectId:projectIds[0],limit:5},vector,env.SEARCH_MIN_VECTOR_SIMILARITY,env.SEARCH_MIN_TEXT_RANK,projectIds);
      if(!rows.length)return empty;
      if(rows.some(row=>!projectIds.includes(row.project_id)))throw Error('Escopo incompatível');
      stage='context_build';
      let remaining=20000;
      const context=rows.flatMap(row=>{
        const text=row.text.slice(0,Math.min(8000,remaining));remaining-=text.length;
        return text.trim()?[{id:row.id,text}]:[];
      });
      if(!context.length)return empty;
      stage='harness';
      const adapter=new EvidenceEngine(this.engine);
      const response=await new HarnessService(this.revisions,adapter,this.chats).run(projectIds[0],
        {mode:'consulta',operation:'responder',level:'pbi',fields:{pergunta:parsed.data.pergunta},context:[]},context,diagnosticId);
      if(!adapter.evidence.length)return empty;
      stage='source_revalidation';
      const current=await this.chats.currentRagChunks(userId,adapter.evidence.map(item=>item.source_id));
      if(adapter.evidence.some(item=>{
        const source=rows.find(row=>row.id===item.source_id)!;
        const latest=current.find(row=>row.id===item.source_id);
        return !latest||latest.projeto_id!==source.project_id||latest.entidade_tipo!==source.entity_type
          ||latest.entidade_id!==source.entity_id||latest.texto!==source.text
          ||JSON.stringify(latest.metadados_json??{})!==JSON.stringify(source.metadata??{})
          ||!wholePassage(latest.texto,item.quote);
      }))throw Error('Fonte alterada, indisponível ou passagem incompleta');
      stage='response_assembly';
      const answer=projectIds.length>1?adapter.evidence.map(item=>{
        const source=rows.find(row=>row.id===item.source_id)!;
        return `${escapeMarkdown(source.project_name)}: ${escapeMarkdown(item.quote)} [${item.source_id}]`;
      }).join('\n\n'):(response.result as {answer:string}).answer;
      return {...empty,resposta:answer,fontes:usedSources(rows,adapter.evidence),
        evidencias:adapter.evidence.map(item=>({chunk_id:item.source_id,texto:item.quote}))};
    } catch (error) {
      const requestId=diagnosticIdFrom(error,diagnosticId);
      const harnessAlreadyLogged=error instanceof AppError && error.code==='AI_HARNESS_UNAVAILABLE'
        && requestId===diagnosticId;
      if(!harnessAlreadyLogged) console.error('[RAG] Request failed',{
        diagnostico_id:requestId,
        etapa:stage,
        codigo:RAG_FAILURE_CODES[stage],
        duracao_ms:Math.round(performance.now()-startedAt),
      });
      throw new AppError('O assistente está indisponível ou não conseguiu validar as evidências. Sua pergunta foi preservada.',503,'RAG_UNAVAILABLE',{diagnostico_id:requestId});
    }
  }
}
