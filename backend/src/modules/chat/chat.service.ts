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
  type ChatProgressStage,
  type ChatSource,
  type ProjectKnowledgeReadiness,
  type ConversationTurn,
  type Conversation,
  type ConversationScope,
  type QueryInput,
  type QueryResult,
} from "./chat.types.js";

export interface AssistantClient {
  ask(pergunta: string, projetoId?: string,usuarioId?:string,onProgress?:(stage:ChatProgressStage)=>void,signal?:AbortSignal): Promise<AssistantAnswer>;
  askProjects?(pergunta: string, projetoIds: string[],usuarioId:string,onProgress?:(stage:ChatProgressStage)=>void,signal?:AbortSignal,history?:ConversationTurn[]): Promise<AssistantAnswer>;
}

const MAX_CONTEXT_MESSAGES = 8;
const MAX_CONTEXT_CHARS = 4_000;
const MAX_CONTEXT_MESSAGE_CHARS = 1_000;

export function recentConversationContext(messages: ChatMessage[], currentMessageId: string): ConversationTurn[] {
  const eligible = messages
    .filter((message): message is ChatMessage & { remetente: "user" | "assistant" } => message.id !== currentMessageId
      && (message.remetente === "user" || message.remetente === "assistant")
      && (message.processing_status === undefined || message.processing_status === "completed")
      && validChatText(message.conteudo)
      && message.conteudo.trim().length > 0)
    .slice(-MAX_CONTEXT_MESSAGES);

  let remaining = MAX_CONTEXT_CHARS;
  const turns: ConversationTurn[] = [];
  for (const message of eligible.reverse()) {
    if (remaining <= 0) break;
    const content = [...message.conteudo.trim()].slice(-Math.min(MAX_CONTEXT_MESSAGE_CHARS, remaining)).join("");
    if (!content) continue;
    turns.unshift({ role: message.remetente, content });
    remaining -= content.length;
  }
  return turns;
}

type RagAnswerer = Pick<RagService, 'answer'>;

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
      ...(typeof source.projeto_id === "string" && UUID_REGEX.test(source.projeto_id) ? { projeto_id: source.projeto_id } : {}),
      ...(typeof source.projeto_nome === "string" ? { projeto_nome: source.projeto_nome.slice(0, 200) } : {}),
      ...(typeof source.entidade_id === "string" && UUID_REGEX.test(source.entidade_id) ? { entidade_id: source.entidade_id } : {}),
      ...(typeof source.url === "string" && source.url.startsWith("/projects/") && !/[\\\s]/.test(source.url) ? { url: source.url.slice(0, 500) } : {}),
      ...(Array.isArray(source.chunk_ids) ? { chunk_ids: source.chunk_ids.filter((id): id is string => typeof id === "string" && UUID_REGEX.test(id)).slice(0, 20) } : {}),
    }];
  });
}

export class HttpAssistantClient implements AssistantClient {
  constructor(private readonly baseUrl: string = env.AI_SERVICE_URL, private readonly repository = new ChatRepository(), private readonly ragAnswerer?: RagAnswerer) { }

  async ask(pergunta: string, projetoId?: string,usuarioId?:string,onProgress?:(stage:ChatProgressStage)=>void,signal?:AbortSignal): Promise<AssistantAnswer> {
    if (!projetoId) throw new ValidationError("Escolha um projeto.");
    if(!usuarioId)throw new ValidationError('Autenticação necessária.');
    return this.askProjects(pergunta, [projetoId], usuarioId, onProgress, signal);
  }

  async askProjects(pergunta: string, projetoIds: string[],usuarioId:string,onProgress?:(stage:ChatProgressStage)=>void,signal?:AbortSignal,history:ConversationTurn[]=[]): Promise<AssistantAnswer> {
    if (!projetoIds.length) throw new ValidationError("Você não tem projetos disponíveis para consulta.");
    // O RAG já monta a resposta exclusivamente com citações verificadas.
    // Não substituir esse texto por uma segunda geração livre sem validação de evidências.
    const rag=this.ragAnswerer??new RagService(this.repository,new SearchRepository(),new HttpSearchEmbeddingClient(this.baseUrl),undefined,new HttpHarnessEngine(this.baseUrl));
    return rag.answer(usuarioId,pergunta,projetoIds,onProgress,signal,history);
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

  accessibleProjectsWithKnowledgeReadiness(usuarioId: string): Promise<ProjectKnowledgeReadiness[]> {
    return this.repository.accessibleProjectsWithKnowledgeReadiness(usuarioId);
  }

  async listConversations(usuarioId: string): Promise<Conversation[]> {
    const items = await this.repository.listConversations(usuarioId);
    const permitted = new Set((await this.repository.accessibleProjects(usuarioId)).map(p => p.id));
    const unsafeGeneral = new Set(await this.repository.unsafeGeneralConversationIds(usuarioId));
    return items.map(c => {
      const accessibleProject = c.escopo_tipo === "projeto" && c.projeto_id !== null && permitted.has(c.projeto_id);
      const accessibleGeneral = c.escopo_tipo === "todos_autorizados" && permitted.size > 0 && !unsafeGeneral.has(c.id);
      return accessibleProject || accessibleGeneral
        ? c
        : { ...c, projeto_id: null, projeto_nome: null, escopo_tipo: "indisponivel" as const };
    });
  }

  private async requireProject(projetoId: string | undefined, usuarioId: string): Promise<string> {
    if (!projetoId) throw new ValidationError("Escolha um projeto para iniciar a conversa.");
    validateUuid(projetoId, "ID do projeto");
    if (!(await this.repository.projectExists(projetoId, usuarioId))) throw new NotFoundError("Projeto não encontrado.");
    return projetoId;
  }

  private async resolveScope(usuarioId: string, requestedScope: ConversationScope | undefined, projetoId?: string): Promise<{ scope: "projeto" | "todos_autorizados"; projectIds: string[]; projectId: string | null }> {
    const scope = requestedScope ?? (projetoId ? "projeto" : undefined);
    if (scope === "projeto") {
      const authorizedProject = await this.requireProject(projetoId, usuarioId);
      return { scope, projectIds: [authorizedProject], projectId: authorizedProject };
    }
    if (scope === "todos_autorizados") {
      if (projetoId) throw new ValidationError("Não informe projeto_id quando o escopo for todos os projetos permitidos.");
      const projects = await this.repository.accessibleProjects(usuarioId);
      if (!projects.length) throw new ValidationError("Você não tem projetos disponíveis para consulta.");
      return { scope, projectIds: projects.map(project => project.id), projectId: null };
    }
    throw new ValidationError("Escolha um projeto ou todos os projetos permitidos.");
  }

  private async conversationScope(usuarioId: string, conversation: Conversation): Promise<{ scope: "projeto" | "todos_autorizados"; projectIds: string[] }> {
    if (conversation.escopo_tipo === "projeto" && conversation.projeto_id) {
      return { scope: "projeto", projectIds: [await this.requireProject(conversation.projeto_id, usuarioId)] };
    }
    if (conversation.escopo_tipo === "todos_autorizados") {
      const projects = await this.repository.accessibleProjects(usuarioId);
      if (!projects.length) throw new NotFoundError("Conversa não encontrada.");
      if (await this.repository.hasUnsafeGeneralSources(conversation.id, usuarioId)) {
        throw new NotFoundError("O histórico desta conversa contém fontes fora do seu acesso atual. Inicie uma nova conversa.");
      }
      return { scope: "todos_autorizados", projectIds: projects.map(project => project.id) };
    }
    if (!conversation.escopo_tipo && conversation.projeto_id) {
      return { scope: "projeto", projectIds: [await this.requireProject(conversation.projeto_id, usuarioId)] };
    }
    throw new NotFoundError("O escopo desta conversa não está mais disponível. Inicie uma nova conversa.");
  }

  async createConversation(usuarioId: string, input: { titulo?: unknown; projetoId?: string; escopo?: Exclude<ConversationScope, "indisponivel"> }): Promise<Conversation> {
    const { scope, projectId } = await this.resolveScope(usuarioId, input.escopo, input.projetoId);
    const titulo = typeof input.titulo === "string" && input.titulo.trim() ? [...input.titulo.trim()].slice(0, 120).join('') : "Nova conversa";
    if(!validChatText(titulo))throw new ValidationError('Use texto Unicode válido, sem caractere nulo.');
    return this.repository.createConversation(usuarioId, projectId, titulo, scope);
  }

  async deleteConversation(usuarioId: string, conversaId: string): Promise<void> {
    validateUuid(conversaId, "ID da conversa");
    const deleted = await this.repository.deleteConversation(conversaId, usuarioId);
    if (!deleted) throw new NotFoundError("Conversa não encontrada.");
  }

  async renameConversation(usuarioId: string, conversaId: string, titleInput: unknown): Promise<Conversation> {
    validateUuid(conversaId, "ID da conversa");
    if (typeof titleInput !== "string") throw new ValidationError("Informe um título para a conversa.");
    const titulo = titleInput.trim();
    if (!titulo) throw new ValidationError("O título da conversa não pode ficar vazio.");
    if ([...titulo].length > 120) throw new ValidationError("O título da conversa deve ter no máximo 120 caracteres.");
    if (!validChatText(titulo)) throw new ValidationError("Use texto Unicode válido, sem caractere nulo.");

    const current = await this.repository.findOwnedConversation(conversaId, usuarioId);
    if (!current) throw new NotFoundError("Conversa não encontrada.");
    await this.conversationScope(usuarioId, current);
    const updated = await this.repository.renameConversation(conversaId, usuarioId, titulo);
    if (!updated) throw new NotFoundError("Conversa não encontrada.");
    return updated;
  }

  async deleteMessage(usuarioId: string, conversaId: string, mensagemId: string): Promise<void> {
    validateUuid(conversaId, "ID da conversa");
    validateUuid(mensagemId, "ID da mensagem");
    const conversation = await this.repository.findOwnedConversation(conversaId, usuarioId);
    if (!conversation) throw new NotFoundError("Conversa não encontrada.");
    await this.conversationScope(usuarioId, conversation);
    if (!(await this.repository.deleteMessage(conversaId, mensagemId, usuarioId))) {
      throw new NotFoundError("Mensagem não encontrada.");
    }
  }

  async listMessages(usuarioId: string, conversaId: string): Promise<ChatMessage[]> {
    validateUuid(conversaId, "ID da conversa");
    const conversation = await this.repository.findOwnedConversation(conversaId, usuarioId);
    if (!conversation) throw new NotFoundError("Conversa não encontrada.");
    await this.conversationScope(usuarioId, conversation);
    return this.repository.listMessages(conversaId,usuarioId);
  }

  async query(usuarioId: string, input: QueryInput, onProgress?:(stage:ChatProgressStage)=>void, signal?:AbortSignal, onConversationCreated?:(conversation:Conversation)=>void): Promise<QueryResult> {
    const startedAt=performance.now();
    const logCompleted=(result:QueryResult)=>{
      console.info('[Chat] Request completed',{
        duracao_total_ms:Math.round(performance.now()-startedAt),
        origem:result.origem,
        fontes_utilizadas:result.fontes.length,
      });
      return result;
    };
    const pergunta = input.pergunta.trim();
    if (!pergunta) throw new ValidationError("Digite uma pergunta.");
    if (pergunta.length > MAX_QUESTION_LENGTH) throw new ValidationError(`A pergunta pode ter no máximo ${MAX_QUESTION_LENGTH} caracteres.`);

    if (input.mensagemId && !input.conversaId) throw new ValidationError("A conversa é obrigatória para repetir uma pergunta.");
    if (input.mensagemId) validateUuid(input.mensagemId, "ID da mensagem");
    if(!validChatText(pergunta))throw new ValidationError('Use texto Unicode válido, sem caractere nulo.');

    let scope: "projeto" | "todos_autorizados";
    let projectIds: string[];
    let conversaId = input.conversaId;
    const isExistingConversation = Boolean(input.conversaId);
    if (conversaId) {
      validateUuid(conversaId, "ID da conversa");
      const conversation = await this.repository.findOwnedConversation(conversaId, usuarioId);
      if (!conversation) throw new NotFoundError("Conversa não encontrada.");
      if (input.escopo && input.escopo !== conversation.escopo_tipo) throw new ValidationError("O escopo da conversa não pode ser alterado.");
      if (input.projetoId && input.projetoId !== conversation.projeto_id) throw new ValidationError("O projeto da conversa não pode ser alterado.");
      ({ scope, projectIds } = await this.conversationScope(usuarioId, conversation));
    } else {
      const resolved = await this.resolveScope(usuarioId, input.escopo, input.projetoId);
      scope = resolved.scope;
      projectIds = resolved.projectIds;
      const conversation = await this.repository.createConversation(usuarioId, resolved.projectId, makeTitle(pergunta), scope);
      conversaId = conversation.id;
      try { onConversationCreated?.(conversation); } catch { /* A atualização do cliente não deve interromper o processamento. */ }
    }

    const messageId = input.mensagemId
      ? await this.repository.retryMessage(conversaId, input.mensagemId, pergunta)
      : await this.repository.addMessage(conversaId, "user", pergunta);
    try {

      if(signal?.aborted)throw new DOMException("Consulta interrompida.","AbortError");

      if (isGreetingOnly(pergunta)) {
        const answer: AssistantAnswer = { resposta: GREETING_REPLY, fontes: [] };
        await this.repository.finishMessage(conversaId, messageId, answer.resposta, answer.fontes);
        return logCompleted({ conversa_id: conversaId, escopo_tipo: scope, resposta: answer.resposta, fontes: answer.fontes, origem: "assistente" });
      }

      const history = isExistingConversation
        ? recentConversationContext(await this.repository.listMessages(conversaId, usuarioId), messageId)
        : [];
      const answer=this.assistant.askProjects
        ? await this.assistant.askProjects(pergunta,projectIds,usuarioId,onProgress,signal,history)
        : projectIds.length === 1
          ? await this.assistant.ask(pergunta,projectIds[0],usuarioId,onProgress,signal)
          : (() => { throw new ValidationError("Este assistente não suporta consultas em múltiplos projetos."); })();
      if(signal?.aborted)throw new DOMException("Consulta interrompida.","AbortError");
      const origem:QueryResult['origem']=answer.cobertura==='no_evidence'||answer.cobertura==='out_of_scope'||answer.resposta.startsWith(NOT_FOUND_ANSWER)?'sem_resultado':'assistente';

      await this.repository.finishMessage(conversaId, messageId, answer.resposta, answer.fontes);
      return logCompleted({ conversa_id: conversaId, escopo_tipo: scope, resposta: answer.resposta, fontes: answer.fontes, origem,...(answer.evidencias?{evidencias:answer.evidencias}: {}) });
    } catch (error) {
      await this.repository.failMessage(messageId).catch(() => undefined);
      if(signal?.aborted)throw new AppError("Consulta interrompida pelo usuário.",409,"CHAT_CANCELLED",{conversa_id:conversaId,mensagem_id:messageId});
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
