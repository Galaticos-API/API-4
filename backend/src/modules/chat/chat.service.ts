import axios from "axios";
import { env } from "../../config/env.js";
import { NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";
import { ChatRepository } from "./chat.repository.js";
import {
  MAX_QUESTION_LENGTH,
  NOT_FOUND_ANSWER,
  type AssistantAnswer,
  type ChatMessage,
  type ChatSource,
  type Conversation,
  type QueryInput,
  type QueryResult,
} from "./chat.types.js";

export interface AssistantClient {
  ask(pergunta: string, projetoId?: string): Promise<AssistantAnswer>;
}

export function sanitizeSources(value: unknown): ChatSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const source = item as Record<string, unknown>;
    if (typeof source.id !== "string") return [];
    return [{
      id: source.id.slice(0, 100),
      titulo: typeof source.titulo === "string" ? source.titulo.slice(0, 200) : source.id.slice(0, 100),
      tipo: typeof source.tipo === "string" ? source.tipo.slice(0, 50) : "documento",
    }];
  });
}

export class HttpAssistantClient implements AssistantClient {
  constructor(private readonly baseUrl: string = env.AI_SERVICE_URL) {}

  async ask(pergunta: string, projetoId?: string): Promise<AssistantAnswer> {
    const response = await axios.post(`${this.baseUrl}/rag/query`, { pergunta, projeto_id: projetoId }, { timeout: 5000 });
    const text = response.data?.resposta ?? response.data?.conteudo;
    if (typeof text !== "string" || !text.trim()) throw new Error("Resposta vazia do assistente");
    return { resposta: text, fontes: sanitizeSources(response.data?.fontes) };
  }
}

export function searchPatterns(question: string): string[] {
  const terms = question
    .toLocaleLowerCase("pt-BR")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 4);
  return [...new Set(terms)].slice(0, 6).map((term) => `%${term.replace(/[\\%_]/g, "\\$&")}%`);
}

function makeTitle(question: string): string {
  const clean = question.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
}

export class ChatService {
  constructor(
    private readonly repository: ChatRepository = new ChatRepository(),
    private readonly assistant: AssistantClient = new HttpAssistantClient(),
  ) {}

  listConversations(usuarioId: string): Promise<Conversation[]> {
    return this.repository.listConversations(usuarioId);
  }

  private async requireProject(projetoId: string | undefined): Promise<string | null> {
    if (!projetoId) return null;
    validateUuid(projetoId, "ID do projeto");
    if (!(await this.repository.projectExists(projetoId))) throw new NotFoundError("Projeto não encontrado.");
    return projetoId;
  }

  async createConversation(usuarioId: string, input: { titulo?: unknown; projetoId?: string }): Promise<Conversation> {
    const projetoId = await this.requireProject(input.projetoId);
    const titulo = typeof input.titulo === "string" && input.titulo.trim() ? input.titulo.trim().slice(0, 120) : "Nova conversa";
    return this.repository.createConversation(usuarioId, projetoId, titulo);
  }

  async listMessages(usuarioId: string, conversaId: string): Promise<ChatMessage[]> {
    validateUuid(conversaId, "ID da conversa");
    const conversation = await this.repository.findOwnedConversation(conversaId, usuarioId);
    if (!conversation) throw new NotFoundError("Conversa não encontrada.");
    return this.repository.listMessages(conversaId);
  }

  async query(usuarioId: string, input: QueryInput): Promise<QueryResult> {
    const pergunta = input.pergunta.trim();
    if (!pergunta) throw new ValidationError("Digite uma pergunta.");
    if (pergunta.length > MAX_QUESTION_LENGTH) throw new ValidationError(`A pergunta pode ter no máximo ${MAX_QUESTION_LENGTH} caracteres.`);

    let projetoId = await this.requireProject(input.projetoId);
    let conversaId = input.conversaId;
    if (conversaId) {
      validateUuid(conversaId, "ID da conversa");
      const conversation = await this.repository.findOwnedConversation(conversaId, usuarioId);
      if (!conversation) throw new NotFoundError("Conversa não encontrada.");
      projetoId = projetoId ?? conversation.projeto_id;
    } else {
      conversaId = (await this.repository.createConversation(usuarioId, projetoId, makeTitle(pergunta))).id;
    }

    await this.repository.addMessage(conversaId, "user", pergunta);

    let answer: AssistantAnswer;
    let origem: QueryResult["origem"];
    try {
      answer = await this.assistant.ask(pergunta, projetoId ?? undefined);
      origem = "assistente";
    } catch {
      const chunks = await this.repository.searchChunks(projetoId, searchPatterns(pergunta), 3);
      if (chunks.length > 0) {
        answer = {
          resposta: `O assistente está indisponível. Estes trechos do acervo mencionam termos da sua pergunta:\n\n${chunks.map((chunk) => `- ${chunk.texto}`).join("\n\n")}`,
          fontes: chunks.map((chunk) => ({ id: chunk.id, titulo: `Trecho de ${chunk.entidade_tipo}`, tipo: chunk.entidade_tipo })),
        };
        origem = "busca_textual";
      } else {
        answer = { resposta: NOT_FOUND_ANSWER, fontes: [] };
        origem = "sem_resultado";
      }
    }

    await this.repository.addMessage(conversaId, "assistant", answer.resposta, answer.fontes);
    return { conversa_id: conversaId, resposta: answer.resposta, fontes: answer.fontes, origem };
  }
}
