export interface ChatSource {
  id: string;
  titulo: string;
  tipo: string;
  projeto_id?: string;
  projeto_nome?: string;
  entidade_id?: string;
  url?: string | null;
  chunk_ids?: string[];
}

export type ChatOrigin = "assistente" | "busca_textual" | "sem_resultado";

export type ConversationScope = "projeto" | "todos_autorizados" | "indisponivel";

export interface ProjectKnowledgeReadiness {
  id: string;
  nome: string;
  documentos_total: number;
  documentos_processados: number;
  documentos_pendentes: number;
  documentos_com_falha: number;
  trechos_elegiveis: number;
  trechos_com_embedding: number;
  ultimo_trecho_em: string | null;
  prontidao: "ready" | "partial" | "pending" | "failed" | "empty";
}

export type ChatProgressStage = "searching" | "synthesizing" | "validating";

export interface Conversation {
  id: string;
  usuario_id: string;
  projeto_id: string | null;
  projeto_nome?: string | null;
  escopo_tipo?: ConversationScope;
  titulo: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversa_id: string;
  remetente: "user" | "assistant" | "system";
  conteudo: string;
  fontes_json: ChatSource[];
  processing_status?: "pending" | "completed" | "failed";
  created_at: string;
}

/** Bounded conversational context used only to resolve references in a follow-up query. */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChunkMatch {
  id: string;
  entidade_tipo: string;
  entidade_id: string;
  texto: string;
  metadados_json?: Record<string, unknown>;
}

export interface QueryInput {
  conversaId?: string;
  mensagemId?: string;
  projetoId?: string;
  escopo?: Exclude<ConversationScope, "indisponivel">;
  pergunta: string;
}

export interface QueryResult {
  conversa_id: string;
  escopo_tipo: Exclude<ConversationScope, "indisponivel">;
  resposta: string;
  fontes: ChatSource[];
  origem: ChatOrigin;
  evidencias?: Array<{chunk_id:string;texto:string}>;
}

export interface AssistantAnswer {
  resposta: string;
  fontes: ChatSource[];
  evidencias?: Array<{chunk_id:string;texto:string}>;
  cobertura?: 'complete'|'partial'|'no_evidence'|'out_of_scope';
}

export const MAX_QUESTION_LENGTH = 2000;
export const validChatText = (text:string) => !/[\u0000\uD800-\uDFFF]/u.test(text);
export const NOT_FOUND_ANSWER = "Informação não encontrada no acervo do projeto.";
export const NO_CANDIDATES_ANSWER = "Não localizei registros que correspondam a essa pergunta no escopo consultado.";
export const NO_SUPPORT_ANSWER = "Encontrei registros relacionados, mas eles não apresentam evidências suficientes para responder com segurança.";
export const SCOPE_LIMIT_ANSWER = "Se quiser, reformule usando o nome de uma funcionalidade, tecnologia, decisão ou regra de negócio. Também posso resumir requisitos e decisões registrados nos projetos selecionados.";
export const OUT_OF_SCOPE_ANSWER = "Essa pergunta parece estar fora do contexto dos projetos consultados. Posso ajudar com requisitos, decisões técnicas, tecnologias, regras de negócio e histórico registrados neles.";
export const UNAVAILABLE_ASPECT_NOTICE = "Não consegui analisar parte da pergunta agora; tente de novo em instantes para completar a resposta.";
export const PARTIAL_ANSWER_NOTICE = "Consegui confirmar parte do que você perguntou; os outros pontos não aparecem nas evidências recuperadas.";
