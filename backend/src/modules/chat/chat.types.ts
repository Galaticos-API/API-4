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

export interface Conversation {
  id: string;
  usuario_id: string;
  projeto_id: string | null;
  projeto_nome?: string | null;
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
  pergunta: string;
}

export interface QueryResult {
  conversa_id: string;
  resposta: string;
  fontes: ChatSource[];
  origem: ChatOrigin;
  evidencias?: Array<{chunk_id:string;texto:string}>;
}

export interface AssistantAnswer {
  resposta: string;
  fontes: ChatSource[];
  evidencias?: Array<{chunk_id:string;texto:string}>;
}

export const MAX_QUESTION_LENGTH = 2000;
export const validChatText = (text:string) => !/[\u0000\uD800-\uDFFF]/u.test(text);
export const NOT_FOUND_ANSWER = "Informação não encontrada no acervo do projeto.";
