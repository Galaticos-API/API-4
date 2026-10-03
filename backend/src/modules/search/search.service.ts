import axios from "axios";
import { env } from "../../config/env.js";
import { AppError, NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";
import { SearchRepository } from "./search.repository.js";
import { SEARCH_LEVELS, type HybridSearchInput, type HybridSearchResult, type SearchLevel } from "./search.types.js";

export interface SearchEmbeddingClient {
  embed(text: string): Promise<number[]>;
}

export class HttpSearchEmbeddingClient implements SearchEmbeddingClient {
  constructor(private readonly baseUrl = env.AI_SERVICE_URL) {}

  async embed(text: string): Promise<number[]> {
    try {
      const response = await axios.post(`${this.baseUrl.replace(/\/$/, "")}/embeddings`, { text }, { timeout: 10_000 });
      return response.data?.embedding;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw new AppError("O serviço local de embeddings rejeitou a consulta.", 502, "EMBEDDING_SERVICE_ERROR");
      }
      throw new AppError("O serviço local de embeddings está indisponível.", 503, "EMBEDDING_SERVICE_UNAVAILABLE");
    }
  }
}

export class SearchService {
  constructor(
    private readonly repository: SearchRepository = new SearchRepository(),
    private readonly embeddings: SearchEmbeddingClient = new HttpSearchEmbeddingClient(),
    private readonly minimumSimilarity = env.SEARCH_MIN_VECTOR_SIMILARITY,
    private readonly minimumTextRank = env.SEARCH_MIN_TEXT_RANK,
  ) {}

  async search(input: HybridSearchInput): Promise<HybridSearchResult> {
    const query = input.query.trim();
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

    const items = await this.repository.hybridSearch({ ...input, query }, vector, this.minimumSimilarity, this.minimumTextRank);
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
