import { env } from "../../config/env.js";
import { AppError, NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";
import { HttpSearchEmbeddingClient, type SearchEmbeddingClient } from "../search/search.service.js";
import { SimilarItemsRepository } from "./similar-items.repository.js";
import {
  MAX_SIMILAR_RESULTS,
  MIN_DRAFT_LENGTH,
  draftSearchSchema,
  reuseSchema,
  type ReuseResult,
  type SimilarEntityType,
  type SimilarItem,
  type SimilarItemRow,
  type SimilarSearchResult,
} from "./similar-items.types.js";

const LABELS: Record<SimilarEntityType, string> = { epico: "épico", feature: "feature", pbi: "PBI" };
const EMPTY: SimilarSearchResult = { items: [], total: 0, degradado: false };

function zodMessage(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

function validVector(vector: unknown): vector is number[] {
  return Array.isArray(vector) && vector.length === 1024
    && vector.every((value) => typeof value === "number" && Number.isFinite(value))
    && !vector.every((value) => value === 0);
}

export function toSimilarItem(row: SimilarItemRow, currentProjectId: string): SimilarItem {
  const caminho: SimilarItem["caminho"] = [];
  if (row.epico_id && row.epico_titulo && row.tipo !== "epico") caminho.push({ tipo: "epico", id: row.epico_id, titulo: row.epico_titulo });
  if (row.feature_id && row.feature_titulo && row.tipo === "pbi") caminho.push({ tipo: "feature", id: row.feature_id, titulo: row.feature_titulo });
  return {
    tipo: row.tipo,
    id: row.id,
    codigo: row.codigo,
    titulo: row.titulo,
    status: row.status,
    similaridade: Math.round(Number(row.similaridade) * 100) / 100,
    trecho: row.trecho,
    projeto: { id: row.projeto_id, nome: row.projeto_nome },
    outro_projeto: row.projeto_id !== currentProjectId,
    caminho,
    origem: [row.projeto_nome, ...caminho.map((node) => node.titulo)].join(" › "),
    ja_aproveitado: row.ja_aproveitado,
  };
}

export class SimilarItemsService {
  constructor(
    private readonly repository: SimilarItemsRepository = new SimilarItemsRepository(),
    private readonly embeddings: SearchEmbeddingClient = new HttpSearchEmbeddingClient(),
    private readonly minimumSimilarity: number = env.SIMILAR_MIN_VECTOR_SIMILARITY,
  ) {}

  async search(projectId: string, usuarioId: string, body: unknown): Promise<SimilarSearchResult> {
    validateUuid(projectId, "ID do projeto");
    const parsed = draftSearchSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(zodMessage(parsed.error), parsed.error.flatten().fieldErrors);
    const { tipo, titulo, descricao, excluir_id: excluirId } = parsed.data;
    if (excluirId !== undefined) validateUuid(excluirId, `ID do ${LABELS[tipo]}`);
    if (!(await this.repository.projectExists(projectId))) throw new NotFoundError("Projeto não encontrado.");

    const text = [titulo, descricao].filter((part) => part && part.length > 0).join("\n").trim();
    if (text.length < MIN_DRAFT_LENGTH) return { ...EMPTY };

    let vector: unknown;
    try {
      vector = await this.embeddings.embed(text.slice(0, 2000));
    } catch (error) {
      if (error instanceof AppError) return { items: [], total: 0, degradado: true };
      throw error;
    }
    if (!validVector(vector)) return { items: [], total: 0, degradado: true };

    const rows = await this.repository.findSimilar({
      tipo,
      vector,
      usuarioId,
      projetoId: projectId,
      excluirId: excluirId ?? null,
      minimoSimilaridade: this.minimumSimilarity,
      limite: MAX_SIMILAR_RESULTS,
    });
    const items = rows.map((row) => toSimilarItem(row, projectId));
    return { items, total: items.length, degradado: false };
  }

  async reuse(tipo: SimilarEntityType, entityId: string, origemId: string, usuarioId: string, body: unknown): Promise<ReuseResult> {
    validateUuid(entityId, `ID do ${LABELS[tipo]}`);
    validateUuid(origemId, `ID do ${LABELS[tipo]} de origem`);
    if (entityId === origemId) throw new ValidationError("Não é possível aproveitar o próprio item.");
    const parsed = reuseSchema(tipo).safeParse(body ?? {});
    if (!parsed.success) throw new ValidationError(zodMessage(parsed.error), parsed.error.flatten().fieldErrors);
    return this.repository.reuse({
      tipo,
      destinoId: entityId,
      origemId,
      campos: parsed.data.campos ? [...new Set(parsed.data.campos)] : null,
      usuarioId,
    });
  }
}

export const similarItemsService = new SimilarItemsService();
