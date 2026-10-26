import { HttpHarnessEngine } from "../harness/harness.service.js";
export { searchPatterns } from "../harness/search-patterns.js";
import { env } from "../../config/env.js";
import { AppError, NotFoundError, ValidationError, UUID_REGEX, validateUuid } from "../../shared/errors.js";
import { ChatRepository } from "./chat.repository.js";
import { GREETING_REPLY, isGreetingOnly } from "./greetings.js";
import { RagService } from './rag.service.js';
import { SearchRepository } from '../search/search.repository.js';
import { HttpSearchEmbeddingClient } from '../search/search.service.js';
import {
  MAX_QUESTION_LENGTH,
  NOT_FOUND_ANSWER,
  validChatText,
  type AssistantAnswer,
  type ChatMessage,
  type ChatSource,
  type Conversation,
  type QueryInput,
  type QueryResult,
} from "./chat.types.js";

export interface AssistantClient {
  ask(pergunta: string, projetoId?: string,usuarioId?:string): Promise<AssistantAnswer>;
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
  constructor(private readonly baseUrl: string = env.AI_SERVICE_URL, private readonly repository = new ChatRepository()) { }

  async ask(pergunta: string, projetoId?: string,usuarioId?:string): Promise<AssistantAnswer> {
    if (!projetoId) throw new ValidationError("Escolha um projeto.");
    if(!usuarioId)throw new ValidationError('Autenticação necessária.');
    return new RagService(this.repository,new SearchRepository(),new HttpSearchEmbeddingClient(this.baseUrl),undefined,new HttpHarnessEngine(this.baseUrl))
      .answer(usuarioId,pergunta,[projetoId]);
  }
}

export function citedSources(text: string, chunks: Array<{id: string; entidade_tipo: string; metadados_json?: Record<string, unknown>}>): ChatSource[] {
  const ids = [...text.matchAll(/\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi)].map(match => match[1].toLowerCase());
  const byId = new Map(chunks.map(chunk => [chunk.id.toLowerCase(), chunk]));
  if (!ids.length || ids.some(id => !byId.has(id))) throw new Error("Resposta sem citações válidas");
  return [...new Set(ids)].map(id => {
    const chunk = byId.get(id)!;
    const metadata = chunk.metadados_json;
    const title = chunk.entidade_tipo === 'analise_repositorio' && typeof metadata?.run_id === 'string'
      ? `Relatório de IA revisado ${String(metadata.repositorio_url ?? '')} · execução ${metadata.run_id}`
      : 'Trecho citado de ' + chunk.entidade_tipo;
    return { id, titulo: title, tipo: chunk.entidade_tipo };
  });
}


function makeTitle(question: string): string {
  const clean = question.replace(/\s+/g, " ").trim();
  const characters=[...clean];
  return characters.length > 60 ? `${characters.slice(0, 57).join('')}...` : clean;
}

export class ChatService {
  constructor(
    private readonly repository: ChatRepository = new ChatRepository(),
    private readonly assistant: AssistantClient = new HttpAssistantClient(env.AI_SERVICE_URL, repository),
  ) { }

  accessibleProjects(usuarioId: string) { return this.repository.accessibleProjects(usuarioId); }

  async listConversations(usuarioId: string): Promise<Conversation[]> {
    const items = await this.repository.listConversations(usuarioId);
    const permitted = new Set((await this.repository.accessibleProjects(usuarioId)).map(p => p.id));
    return items.filter(c => c.projeto_id !== null && permitted.has(c.projeto_id));
  }

  private async requireProject(projetoId: string | undefined, usuarioId: string): Promise<string> {
    if (!projetoId) throw new ValidationError("Escolha um projeto para iniciar a conversa.");
    validateUuid(projetoId, "ID do projeto");
    if (!(await this.repository.projectExists(projetoId, usuarioId))) throw new NotFoundError("Projeto não encontrado.");
    return projetoId;
  }

  async createConversation(usuarioId: string, input: { titulo?: unknown; projetoId?: string }): Promise<Conversation> {
    const projetoId = await this.requireProject(input.projetoId, usuarioId);
    const titulo = typeof input.titulo === "string" && input.titulo.trim() ? [...input.titulo.trim()].slice(0, 120).join('') : "Nova conversa";
    if(!validChatText(titulo))throw new ValidationError('Use texto Unicode válido, sem caractere nulo.');
    return this.repository.createConversation(usuarioId, projetoId, titulo);
  }

  async deleteConversation(usuarioId: string, conversaId: string): Promise<void> {
    validateUuid(conversaId, "ID da conversa");
    const deleted = await this.repository.deleteConversation(conversaId, usuarioId);
    if (!deleted) throw new NotFoundError("Conversa não encontrada.");
  }

  async deleteMessage(usuarioId: string, conversaId: string, mensagemId: string): Promise<void> {
    validateUuid(conversaId, "ID da conversa");
    validateUuid(mensagemId, "ID da mensagem");
    const conversation = await this.repository.findOwnedConversation(conversaId, usuarioId);
    if (!conversation) throw new NotFoundError("Conversa não encontrada.");
    await this.requireProject(conversation.projeto_id ?? undefined, usuarioId);
    if (!(await this.repository.deleteMessage(conversaId, mensagemId, usuarioId))) {
      throw new NotFoundError("Mensagem não encontrada.");
    }
  }

  async listMessages(usuarioId: string, conversaId: string): Promise<ChatMessage[]> {
    validateUuid(conversaId, "ID da conversa");
    const conversation = await this.repository.findOwnedConversation(conversaId, usuarioId);
    if (!conversation) throw new NotFoundError("Conversa não encontrada.");
    await this.requireProject(conversation.projeto_id ?? undefined, usuarioId);
    return this.repository.listMessages(conversaId,usuarioId);
  }

  async query(usuarioId: string, input: QueryInput): Promise<QueryResult> {
    const pergunta = input.pergunta.trim();
    if (!pergunta) throw new ValidationError("Digite uma pergunta.");
    if (pergunta.length > MAX_QUESTION_LENGTH) throw new ValidationError(`A pergunta pode ter no máximo ${MAX_QUESTION_LENGTH} caracteres.`);

    if (input.mensagemId && !input.conversaId) throw new ValidationError("A conversa é obrigatória para repetir uma pergunta.");
    if (input.mensagemId) validateUuid(input.mensagemId, "ID da mensagem");
    if(!validChatText(pergunta))throw new ValidationError('Use texto Unicode válido, sem caractere nulo.');

    let projetoId: string;
    let conversaId = input.conversaId;
    if (conversaId) {
      validateUuid(conversaId, "ID da conversa");
      const conversation = await this.repository.findOwnedConversation(conversaId, usuarioId);
      if (!conversation) throw new NotFoundError("Conversa não encontrada.");
      if (input.projetoId && input.projetoId !== conversation.projeto_id) throw new ValidationError("O projeto da conversa não pode ser alterado.");
      projetoId = await this.requireProject(conversation.projeto_id ?? undefined, usuarioId);
    } else {
      projetoId = await this.requireProject(input.projetoId, usuarioId);
      conversaId = (await this.repository.createConversation(usuarioId, projetoId, makeTitle(pergunta))).id;
    }

    const messageId = input.mensagemId
      ? await this.repository.retryMessage(conversaId, input.mensagemId, pergunta)
      : await this.repository.addMessage(conversaId, "user", pergunta);
    try {

      if (isGreetingOnly(pergunta)) {
        const answer: AssistantAnswer = { resposta: GREETING_REPLY, fontes: [] };
        await this.repository.finishMessage(conversaId, messageId, answer.resposta, answer.fontes);
        return { conversa_id: conversaId, resposta: answer.resposta, fontes: answer.fontes, origem: "assistente" };
      }

      const answer=await this.assistant.ask(pergunta,projetoId,usuarioId);
      const origem:QueryResult['origem']=answer.resposta===NOT_FOUND_ANSWER?'sem_resultado':'assistente';

      await this.repository.finishMessage(conversaId, messageId, answer.resposta, answer.fontes);
      return { conversa_id: conversaId, resposta: answer.resposta, fontes: answer.fontes, origem,...(answer.evidencias?{evidencias:answer.evidencias}: {}) };
    } catch (error) {
      await this.repository.failMessage(messageId).catch(() => undefined);
      const causeDetails = error instanceof AppError && typeof error.details === "object" && error.details !== null
        ? error.details as Record<string, unknown>
        : undefined;
      const diagnosticoId = typeof causeDetails?.diagnostico_id === "string" && UUID_REGEX.test(causeDetails.diagnostico_id)
        ? causeDetails.diagnostico_id
        : undefined;
      throw new AppError("Não foi possível processar a pergunta. Tente novamente.", 503, "CHAT_FAILED", {
        conversa_id: conversaId,
        mensagem_id: messageId,
        ...(diagnosticoId ? { diagnostico_id: diagnosticoId } : {}),
      });
    }
  }
}
