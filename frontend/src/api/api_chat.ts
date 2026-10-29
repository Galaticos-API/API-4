import { ApiError, apiRequest } from "./api_auth";
import { serverMessage } from "./api_errors";

export type ChatOrigin = "assistente" | "busca_textual" | "sem_resultado";
export type ChatScopeType = "projeto" | "todos_autorizados" | "indisponivel";
export type ChatProgressStage = "searching" | "synthesizing" | "validating";
export type ProjectKnowledgeState = "ready" | "partial" | "pending" | "failed" | "empty";

export interface ChatProject {
  id: string;
  nome: string;
  documentos_total?: number;
  documentos_processados?: number;
  documentos_pendentes?: number;
  documentos_com_falha?: number;
  trechos_elegiveis?: number;
  trechos_com_embedding?: number;
  ultimo_trecho_em?: string | null;
  prontidao?: ProjectKnowledgeState;
}

export interface ChatSource {
  id: string;
  titulo: string;
  tipo: string;
  projeto_id?: string;
  projeto_nome?: string;
  url?: string | null;
}

export interface ChatConversation {
  id: string;
  titulo: string;
  projeto_id: string | null;
  projeto_nome: string | null;
  escopo_tipo?: ChatScopeType;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  remetente: "user" | "assistant" | "system";
  conteudo: string;
  fontes: ChatSource[];
  created_at: string | null;
  origem?: ChatOrigin;
  processing?: boolean;
  failed?: boolean;
}

export interface ChatAnswer {
  conversa_id: string;
  escopo_tipo?: Exclude<ChatScopeType, "indisponivel">;
  resposta: string;
  fontes: ChatSource[];
  origem: ChatOrigin;
}

export const MAX_QUESTION_LENGTH = 2000;
// Inclui os embeddings (até 10 s), a geração (até 60 s) e a comunicação.
const QUERY_TIMEOUT_MS = 90_000;

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
      projeto_id: typeof item.projeto_id === "string" ? item.projeto_id : undefined,
      projeto_nome: typeof item.projeto_nome==='string'?item.projeto_nome:undefined,
      url: typeof item.url==='string'&&item.url.startsWith('/projects/')&&!/[\\\s]/.test(item.url)?item.url:null,
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
    escopo_tipo: value.escopo_tipo === "projeto" || value.escopo_tipo === "todos_autorizados" || value.escopo_tipo === "indisponivel" ? value.escopo_tipo : "indisponivel",
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
    processing: value.processing_status === "pending",
    failed: value.processing_status === "failed",
    fontes: parseSources(value.fontes_json ?? value.fontes),
    created_at: typeof value.created_at === "string" ? value.created_at : null,
  };
}

export async function listConversations(signal?: AbortSignal): Promise<ChatConversation[]> {
  const data: unknown = await (await apiRequest("/chat/conversations", { signal })).json();
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error("Lista de conversas inválida");
  return data.items.map(parseConversation);
}

export async function deleteConversation(conversationId: string, signal?: AbortSignal): Promise<void> {
  await apiRequest(`/chat/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
    signal,
  });
}

export async function renameConversation(conversationId: string, title: string, signal?: AbortSignal): Promise<ChatConversation> {
  const response = await apiRequest(`/chat/conversations/${encodeURIComponent(conversationId)}`, {
    method: "PATCH",
    body: JSON.stringify({ titulo: title }),
    signal,
  });
  return parseConversation(await response.json());
}

export async function deleteMessage(conversationId: string, messageId: string, signal?: AbortSignal): Promise<void> {
  await apiRequest(`/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
    signal,
  });
}

export async function listMessages(conversationId: string, signal?: AbortSignal): Promise<ChatMessage[]> {
  const data: unknown = await (await apiRequest(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, { signal })).json();
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error("Lista de mensagens inválida");
  return data.items.map(parseMessage);
}

export async function askQuestion(
  input: { pergunta: string; conversaId?: string | null; projetoId?: string | null; mensagemId?: string | null; escopo?: Exclude<ChatScopeType, "indisponivel"> },
  signal?: AbortSignal,
  onProgress?: (stage: ChatProgressStage) => void,
  onConversation?: (conversation: ChatConversation) => void,
): Promise<ChatAnswer> {
  if (onProgress) return askQuestionWithProgress(input, onProgress, signal, onConversation);
  const deadline = AbortSignal.timeout(QUERY_TIMEOUT_MS);
  const response = await apiRequest("/chat/query", {
    method: "POST",
    body: JSON.stringify({
      pergunta: input.pergunta,
      conversa_id: input.conversaId || undefined,
      mensagem_id: input.mensagemId || undefined,
      projeto_id: input.projetoId || undefined,
      escopo: input.escopo,
    }),
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  }, QUERY_TIMEOUT_MS);
  return parseChatAnswer(await response.json());
}

function parseChatAnswer(data: unknown): ChatAnswer {
  if (!isRecord(data) || typeof data.conversa_id !== "string" || typeof data.resposta !== "string") {
    throw new Error("Resposta do assistente inválida");
  }
  const origem = ["assistente", "busca_textual", "sem_resultado"].includes(String(data.origem)) ? (data.origem as ChatOrigin) : "assistente";
  const escopo_tipo = data.escopo_tipo === "projeto" || data.escopo_tipo === "todos_autorizados" ? data.escopo_tipo : undefined;
  return { conversa_id: data.conversa_id, escopo_tipo, resposta: data.resposta, fontes: parseSources(data.fontes), origem };
}

export async function askQuestionWithProgress(
  input: { pergunta: string; conversaId?: string | null; projetoId?: string | null; mensagemId?: string | null; escopo?: Exclude<ChatScopeType, "indisponivel"> },
  onProgress: (stage: ChatProgressStage) => void,
  signal?: AbortSignal,
  onConversation?: (conversation: ChatConversation) => void,
): Promise<ChatAnswer> {
  const deadline = AbortSignal.timeout(QUERY_TIMEOUT_MS);
  const response = await apiRequest("/chat/query/stream", {
    method: "POST",
    body: JSON.stringify({
      pergunta: input.pergunta,
      conversa_id: input.conversaId || undefined,
      mensagem_id: input.mensagemId || undefined,
      projeto_id: input.projetoId || undefined,
      escopo: input.escopo,
    }),
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  }, QUERY_TIMEOUT_MS);

  // Compatibility fallback for proxies or servers that do not pass through SSE.
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    return parseChatAnswer(await response.json());
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("O fluxo de resposta não está disponível neste navegador.");
  const decoder = new TextDecoder();
  let buffer = "";
  let answer: ChatAnswer | undefined;
  const consumeFrame = (frame: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return;
    const payload: unknown = JSON.parse(data.join("\n"));
    if (event === "conversation") {
      onConversation?.(parseConversation(payload));
      return;
    }
    if (event === "progress") {
      if (isRecord(payload) && ["searching", "synthesizing", "validating"].includes(String(payload.stage))) {
        onProgress(payload.stage as ChatProgressStage);
      }
      return;
    }
    if (event === "completed") { answer = parseChatAnswer(payload); return; }
    if (event === "cancelled") throw new DOMException("Consulta interrompida.", "AbortError");
    if (event === "error") {
      const status = isRecord(payload) && typeof payload.status === "number" ? payload.status : 503;
      throw new ApiError(status, payload);
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary = /\r?\n\r?\n/.exec(buffer);
      while (boundary) {
        consumeFrame(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
        boundary = /\r?\n\r?\n/.exec(buffer);
      }
      if (done) break;
    }
    if (buffer.trim()) consumeFrame(buffer);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!answer) throw new Error("O fluxo terminou sem uma resposta concluída.");
  return answer;
}

export function describeChatError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para continuar a conversa.";
    if (error.status === 404) return serverMessage(error) ?? "Conversa ou projeto não encontrado.";
    if (error.status === 400) return serverMessage(error) ?? "Revise a pergunta e tente novamente.";
    if (error.status === 409) return serverMessage(error) ?? "A mensagem ainda está sendo processada. Tente novamente em instantes.";
    if (error.status === 503) {
      const payload = error.details;
      const details = isRecord(payload) && isRecord(payload.details) ? payload.details : undefined;
      const diagnosticId = details?.diagnostico_id;
      if (typeof diagnosticId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(diagnosticId)) {
        return `A consulta falhou, mas sua pergunta foi preservada. Código de diagnóstico: ${diagnosticId}. Tente novamente.`;
      }
    }
  }
  return "Não foi possível falar com o assistente agora. Verifique a conexão e tente novamente.";
}

export async function listChatProjects(signal?: AbortSignal): Promise<ChatProject[]> {
  const data: unknown = await (await apiRequest("/chat/projects", {signal})).json();
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error("Projetos inválidos");
  return data.items.map(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim()
      || typeof item.nome !== 'string' || !item.nome.trim()) throw new Error('Projeto inválido');
    const count = (key: string) => {
      const value = item[key];
      return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
    };
    const readiness = ["ready", "partial", "pending", "failed", "empty"].includes(String(item.prontidao))
      ? item.prontidao as ProjectKnowledgeState
      : undefined;
    return {
      id: item.id,
      nome: item.nome,
      documentos_total: count("documentos_total"),
      documentos_processados: count("documentos_processados"),
      documentos_pendentes: count("documentos_pendentes"),
      documentos_com_falha: count("documentos_com_falha"),
      trechos_elegiveis: count("trechos_elegiveis"),
      trechos_com_embedding: count("trechos_com_embedding"),
      ultimo_trecho_em: typeof item.ultimo_trecho_em === "string" ? item.ultimo_trecho_em : null,
      prontidao: readiness,
    };
  });
}
