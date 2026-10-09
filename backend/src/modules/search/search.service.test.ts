import test from "node:test";
import assert from "node:assert/strict";
import { AppError, NotFoundError, ValidationError } from "../../shared/errors.js";
import axios from "axios";
import type { SearchRepository } from "./search.repository.js";
import { SearchService } from "./search.service.js";
import type { HybridSearchInput, HybridSearchRow } from "./search.types.js";

const PROJECT = "60000000-0000-4000-8000-000000000001";
const TECH = "60000000-0000-4000-8000-000000000099";
const VECTOR: number[] = Array.from({ length: 1024 }, (_, index) => index === 0 ? 1 : 0);

function createService(overrides: { exists?: boolean; vector?: number[]; failEmbedding?: boolean } = {}) {
  const calls: { input?: HybridSearchInput; vector?: number[]; threshold?: number; textThreshold?: number; embeddings: string[] } = { embeddings: [] };
  const rows: HybridSearchRow[] = [];
  const repository = {
    projectExists: async () => overrides.exists ?? true,
    hybridSearch: async (input: HybridSearchInput, vector: number[], threshold: number, textThreshold: number) => {
      calls.input = input;
      calls.vector = vector;
      calls.threshold = threshold;
      calls.textThreshold = textThreshold;
      return rows;
    },
  } as unknown as SearchRepository;
  const embeddings = {
    embed: async (query: string) => {
      calls.embeddings.push(query);
      if (overrides.failEmbedding) throw new AppError("offline", 503, "EMBEDDING_SERVICE_UNAVAILABLE");
      return overrides.vector ?? VECTOR;
    },
  };
  return { service: new SearchService(repository, embeddings, 0.37, 0.12), calls, rows };
}

const input: HybridSearchInput = { query: "login de cliente", projectId: PROJECT, limit: 5 };

test("cliente HTTP envia o campo esperado pelo FastAPI e valida erros remotos", async () => {
  const originalPost = axios.post;
  const calls: unknown[][] = [];
  axios.post = (async (...args: unknown[]) => {
    calls.push(args);
    return { data: { embedding: VECTOR } };
  }) as typeof axios.post;
  try {
    const client = new (await import("./search.service.js")).HttpSearchEmbeddingClient("http://ai-service/");
    assert.deepEqual(await client.embed("consulta"), VECTOR);
    assert.deepEqual(calls[0].slice(0, 2), ["http://ai-service/embeddings", { text: "consulta" }]);

    axios.post = (async () => { throw { isAxiosError: true, response: { status: 422 } }; }) as typeof axios.post;
    await assert.rejects(client.embed("consulta"), (error: unknown) => error instanceof AppError && error.statusCode === 502);

    axios.post = (async () => { throw new Error("network down"); }) as typeof axios.post;
    await assert.rejects(client.embed("consulta"), (error: unknown) => error instanceof AppError && error.statusCode === 503);
  } finally {
    axios.post = originalPost;
  }
});

test("valida busca, escopo obrigatório, filtros e limite antes de acessar a IA", async () => {
  const { service, calls } = createService();
  await assert.rejects(service.search({ ...input, query: "  " }), ValidationError);
  await assert.rejects(service.search({ ...input, query: "ab" }), ValidationError);
  await assert.rejects(service.search({ ...input, projectId: "not-a-uuid" }), ValidationError);
  await assert.rejects(service.search({ ...input, technologyId: "not-a-uuid" }), ValidationError);
  await assert.rejects(service.search({ ...input, level: "admin" as never }), ValidationError);
  await assert.rejects(service.search({ ...input, limit: 51 }), ValidationError);
  assert.deepEqual(calls.embeddings, []);
});

test("confirma o projeto e solicita embedding para a mesma consulta antes do retrieval", async () => {
  const { service, calls, rows } = createService();
  rows.push({
    id: "chunk-1", project_id: PROJECT, project_name: "API 1", entity_type: "documento",
    entity_id: "document-1", title: "Acesso", text: "Login administrativo", metadata: {},
    source_url: null, relevance_score: 0.03,
  });
  const result = await service.search({ ...input, query: "  login de cliente  ", technologyId: TECH, level: "documento" });

  assert.deepEqual(calls.embeddings, ["login de cliente"]);
  assert.equal(calls.input?.projectId, PROJECT);
  assert.equal(calls.input?.technologyId, TECH);
  assert.equal(calls.input?.level, "documento");
  assert.equal(calls.input?.limit, 5);
  assert.deepEqual(calls.vector, VECTOR);
  assert.equal(calls.threshold, 0.37);
  assert.equal(calls.textThreshold, 0.12);
  assert.equal(result.items[0].id, "chunk-1");
  assert.equal(result.project_id, PROJECT);
  assert.ok(result.metrics.latency_ms >= 0);
});

test("projeto inexistente não chama embeddings", async () => {
  const { service, calls } = createService({ exists: false });
  await assert.rejects(service.search(input), NotFoundError);
  assert.deepEqual(calls.embeddings, []);
});

test("rejeita vetor com dimensão ou valores inválidos", async () => {
  const { service: wrongDimension } = createService({ vector: [1, 2] });
  await assert.rejects(wrongDimension.search(input), (error: unknown) => error instanceof AppError && error.code === "INVALID_EMBEDDING");
  const badVector = [...VECTOR];
  badVector[10] = Number.NaN;
  const { service: nonFinite } = createService({ vector: badVector });
  await assert.rejects(nonFinite.search(input), (error: unknown) => error instanceof AppError && error.code === "INVALID_EMBEDDING");
  const { service: zeroVector } = createService({ vector: Array<number>(1024).fill(0) });
  await assert.rejects(zeroVector.search(input), (error: unknown) => error instanceof AppError && error.code === "INVALID_EMBEDDING");
  const nonNumericVector = [...VECTOR] as unknown as (number | string)[];
  nonNumericVector[4] = "1";
  const { service: nonNumeric } = createService({ vector: nonNumericVector as number[] });
  await assert.rejects(nonNumeric.search(input), (error: unknown) => error instanceof AppError && error.code === "INVALID_EMBEDDING");
});

test("propaga indisponibilidade do serviço local sem degradar silenciosamente para busca textual", async () => {
  const { service } = createService({ failEmbedding: true });
  await assert.rejects(service.search(input), (error: unknown) => error instanceof AppError && error.statusCode === 503);
});
