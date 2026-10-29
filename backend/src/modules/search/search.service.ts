import axios from "axios";
import { validDatabaseText } from '../../shared/text-validation.js';
import { env } from "../../config/env.js";
import { AppError, NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";
import { serviceHeaders } from "../../shared/service-auth.js";
import { SearchRepository } from "./search.repository.js";
import { SEARCH_LEVELS, type HybridSearchInput, type HybridSearchResult, type SearchLevel } from "./search.types.js";
import type { ConversationTurn } from "../chat/chat.types.js";

export interface SearchEmbeddingClient {
  embed(text: string, signal?: AbortSignal): Promise<number[]>;
  planQuery?(question: string, signal?: AbortSignal, history?: ConversationTurn[]): Promise<{ queries: string[]; resolvedQuestion: string; aspects?: string[] }>;
}

export interface QueryPlan {
  queries: string[];
  resolvedQuestion: string;
  aspects: string[];
}

export class HttpSearchEmbeddingClient implements SearchEmbeddingClient {
  constructor(private readonly baseUrl = env.AI_SERVICE_URL) {}

  async embed(text: string, signal?: AbortSignal): Promise<number[]> {
    try {
      const response = await axios.post(`${this.baseUrl.replace(/\/$/, "")}/embeddings`, { text }, { timeout: 10_000, headers: serviceHeaders(), signal });
      return response.data?.embedding;
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Consulta interrompida.", "AbortError");
      if (axios.isAxiosError(error) && error.response) {
        throw new AppError("O serviço local de embeddings rejeitou a consulta.", 502, "EMBEDDING_SERVICE_ERROR");
      }
      throw new AppError("O serviço local de embeddings está indisponível.", 503, "EMBEDDING_SERVICE_UNAVAILABLE");
    }
  }

  async planQuery(question: string, signal?: AbortSignal, history: ConversationTurn[] = []): Promise<QueryPlan> {
    try {
      const response = await axios.post(`${this.baseUrl.replace(/\/$/, "")}/rag/plan-query`, { question, history }, {
        timeout: 16_000,
        headers: serviceHeaders(),
        signal,
      });
      const queries = response.data?.queries;
      const resolved = response.data?.resolved_question;
      const rawAspects = response.data?.aspects;
      if (!Array.isArray(queries) || typeof resolved !== "string" || !resolved.trim() || resolved.length > 2000 || !validDatabaseText(resolved)) {
        return { queries: [fallbackSearchQuery(question)], resolvedQuestion: question, aspects: [question] };
      }
      const normalized = queries.flatMap((query: unknown) => {
        if (typeof query !== "string") return [];
        const cleaned = query.trim().replace(/\s+/g, " ").slice(0, 200);
        return cleaned.length >= 3 && cleaned.toLocaleLowerCase("pt-BR") !== question.trim().toLocaleLowerCase("pt-BR") ? [cleaned] : [];
      });
      const aspects = Array.isArray(rawAspects) ? [...new Set(rawAspects.flatMap((aspect: unknown) => {
        if (typeof aspect !== "string" || !validDatabaseText(aspect)) return [];
        const value = aspect.trim().replace(/\s+/g, " ").slice(0, 500);
        return value.length >= 3 ? [value] : [];
      }))].slice(0, 3) : [];
      return {
        queries: [...new Set(normalized)].slice(0, 2).length ? [...new Set(normalized)].slice(0, 2) : [fallbackSearchQuery(question)],
        resolvedQuestion: history.length ? resolved.trim() : question,
        aspects: aspects.length ? aspects : [history.length ? resolved.trim() : question],
      };
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Consulta interrompida.", "AbortError");
      return { queries: [fallbackSearchQuery(question)], resolvedQuestion: question, aspects: [question] };
    }
  }
}

const CHAT_QUERY_STOP_WORDS = new Set("a as o os um uma uns umas de do da dos das em no na nos nas ao aos por para com sobre qual quais que quem como quando onde porque me diga diz pode poderia gostaria queria saber estamos esta estao foi foram tem usam usando utiliza utilizamos projeto projetos ja neste nesta deste desta desses dessas".split(" "));

export function fallbackSearchQuery(question: string): string {
  const terms = question.match(/[\p{L}\p{N}_.-]+/gu) ?? [];
  const keywords = terms.filter(term => {
    const normalized=term.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    return !CHAT_QUERY_STOP_WORDS.has(normalized) && (term.length > 2 || /^\d+$/.test(term));
  });
  return keywords.join(" ").slice(0, 200) || question.trim().slice(0, 200);
}

export class SearchService {
  constructor(
    private readonly repository: SearchRepository = new SearchRepository(),
    private readonly embeddings: SearchEmbeddingClient = new HttpSearchEmbeddingClient(),
    private readonly minimumSimilarity = env.SEARCH_MIN_VECTOR_SIMILARITY,
    private readonly minimumTextRank = env.SEARCH_MIN_TEXT_RANK,
  ) {}

  async search(input: HybridSearchInput, userId?: string): Promise<HybridSearchResult> {
    const query = input.query.trim();
    if (!validDatabaseText(query)) throw new ValidationError('Use texto Unicode válido, sem caractere nulo.');
    if (query.length < 3) throw new ValidationError("A busca deve ter pelo menos 3 caracteres.");
    if (query.length > 200) throw new ValidationError("A busca pode ter no máximo 200 caracteres.");
    validateUuid(input.projectId, "ID do projeto");
    if (input.technologyId) validateUuid(input.technologyId, "ID da tecnologia");
    if (input.level && !SEARCH_LEVELS.includes(input.level)) throw new ValidationError("Nível de busca inválido.");
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) {
      throw new ValidationError("O limite deve ser um inteiro entre 1 e 50.");
    }
    if (!(await this.repository.projectExists(input.projectId))) throw new NotFoundError("Projeto não encontrado.");

    const startedAt = performance.now();
    const vector = await this.embeddings.embed(query);
    if (!Array.isArray(vector) || vector.length !== 1024 || vector.some((value) => typeof value !== "number" || !Number.isFinite(value)) || vector.every((value) => value === 0)) {
      throw new AppError("O serviço de embeddings retornou um vetor incompatível.", 502, "INVALID_EMBEDDING");
    }

    const items = await this.repository.hybridSearch({ ...input, query }, vector, this.minimumSimilarity, this.minimumTextRank, [input.projectId], userId);
    return {
      items,
      total: items.length,
      query,
      project_id: input.projectId,
      filters: { technology_id: input.technologyId ?? null, level: input.level ?? null },
      metrics: { latency_ms: Math.round(performance.now() - startedAt) },
    };
  }
}

export function parseSearchLevel(value: string | undefined): SearchLevel | undefined {
  if (!value) return undefined;
  if (!SEARCH_LEVELS.includes(value as SearchLevel)) throw new ValidationError("Nível de busca inválido.");
  return value as SearchLevel;
}
