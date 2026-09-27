export interface ChatSource {
  id: string;
  titulo: string;
  tipo: string;
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
  created_at: string;
}

export interface ChunkMatch {
  id: string;
  entidade_tipo: string;
  entidade_id: string;
  texto: string;
}

export interface QueryInput {
  conversaId?: string;
  projetoId?: string;
  pergunta: string;
}

export interface QueryResult {
  conversa_id: string;
  resposta: string;
  fontes: ChatSource[];
  origem: ChatOrigin;
}

export interface AssistantAnswer {
  resposta: string;
  fontes: ChatSource[];
}

export const MAX_QUESTION_LENGTH = 2000;
export const NOT_FOUND_ANSWER = "Informação não encontrada no acervo do projeto.";
