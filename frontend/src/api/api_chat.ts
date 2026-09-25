import { ApiError, apiRequest } from "./api_auth";
import { serverMessage } from "./api_errors";

export type ChatOrigin = "assistente" | "busca_textual" | "sem_resultado";

export interface ChatSource {
  id: string;
  titulo: string;
  tipo: string;
}

export interface ChatConversation {
  id: string;
  titulo: string;
  projeto_id: string | null;
  projeto_nome: string | null;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  remetente: "user" | "assistant" | "system";
  conteudo: string;
  fontes: ChatSource[];
  created_at: string | null;
  origem?: ChatOrigin;
}

export interface ChatAnswer {
  conversa_id: string;
  resposta: string;
  fontes: ChatSource[];
  origem: ChatOrigin;
}

export const MAX_QUESTION_LENGTH = 2000;
const QUERY_TIMEOUT_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSources(value: unknown): ChatSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string") return [];
    return [{
      id: item.id,
      titulo: typeof item.titulo === "string" && item.titulo ? item.titulo : item.id,
      tipo: typeof item.tipo === "string" ? item.tipo : "documento",
    }];
  });
}

function parseConversation(value: unknown): ChatConversation {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.titulo !== "string") {
    throw new Error("Conversa inválida");
  }
  return {
    id: value.id,
    titulo: value.titulo,
    projeto_id: typeof value.projeto_id === "string" ? value.projeto_id : null,
    projeto_nome: typeof value.projeto_nome === "string" ? value.projeto_nome : null,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : "",
  };
}

function parseMessage(value: unknown): ChatMessage {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.conteudo !== "string"
    || !["user", "assistant", "system"].includes(String(value.remetente))) {
    throw new Error("Mensagem inválida");
  }
  return {
    id: value.id,
    remetente: value.remetente as ChatMessage["remetente"],
    conteudo: value.conteudo,
    fontes: parseSources(value.fontes_json ?? value.fontes),
    created_at: typeof value.created_at === "string" ? value.created_at : null,
  };
}

export async function listConversations(signal?: AbortSignal): Promise<ChatConversation[]> {
  const data: unknown = await (await apiRequest("/chat/conversations", { signal })).json();
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error("Lista de conversas inválida");
  return data.items.map(parseConversation);
}

export async function listMessages(conversationId: string, signal?: AbortSignal): Promise<ChatMessage[]> {
  const data: unknown = await (await apiRequest(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, { signal })).json();
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error("Lista de mensagens inválida");
  return data.items.map(parseMessage);
}

export async function askQuestion(
  input: { pergunta: string; conversaId?: string | null; projetoId?: string | null },
  signal?: AbortSignal,
): Promise<ChatAnswer> {
  const response = await apiRequest("/chat/query", {
    method: "POST",
    body: JSON.stringify({
      pergunta: input.pergunta,
      conversa_id: input.conversaId || undefined,
      projeto_id: input.projetoId || undefined,
    }),
    signal: signal ?? AbortSignal.timeout(QUERY_TIMEOUT_MS),
  });
  const data: unknown = await response.json();
  if (!isRecord(data) || typeof data.conversa_id !== "string" || typeof data.resposta !== "string") {
    throw new Error("Resposta do assistente inválida");
  }
  const origem = ["assistente", "busca_textual", "sem_resultado"].includes(String(data.origem)) ? (data.origem as ChatOrigin) : "assistente";
  return { conversa_id: data.conversa_id, resposta: data.resposta, fontes: parseSources(data.fontes), origem };
}

export function describeChatError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para continuar a conversa.";
    if (error.status === 404) return serverMessage(error) ?? "Conversa ou projeto não encontrado.";
    if (error.status === 400) return serverMessage(error) ?? "Revise a pergunta e tente novamente.";
  }
  return "Não foi possível falar com o assistente agora. Verifique a conexão e tente novamente.";
}
