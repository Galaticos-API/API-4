import { ArchiveConflict } from "../projects/archive.types.js";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors.js";
import { SuggestionsRepository } from "./suggestions.repository.js";
import type { CreateSuggestionInput, ResolveSuggestionInput, SuggestionRow } from "./suggestions.types.js";

export const EPIC = "a0000000-0000-4000-8000-000000000002";
export const FEATURE = "a0000000-0000-4000-8000-000000000003";
export const PBI = "a0000000-0000-4000-8000-000000000004";
export const UNKNOWN_ENTITY = "a0000000-0000-4000-8000-00000000ffff";
export const USER = "b0000000-0000-4000-8000-000000000001";
export const OTHER_USER = "b0000000-0000-4000-8000-000000000002";

export class FakeSuggestionsRepository extends SuggestionsRepository {
  public entities = new Set([EPIC, FEATURE, PBI]);
  public archived = new Set<string>();
  public requiresJustification = new Set<string>();
  public rows: SuggestionRow[] = [];
  private sequence = 0;

  constructor() {
    super();
  }

  private nextId(): string {
    this.sequence += 1;
    return `c0000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`;
  }

  async entityExists(_kind: CreateSuggestionInput["entidadeTipo"], entityId: string): Promise<boolean> {
    return this.entities.has(entityId);
  }

  async listForEntity(kind: CreateSuggestionInput["entidadeTipo"], entityId: string): Promise<SuggestionRow[]> {
    return this.rows
      .filter((row) => row.entidade_tipo === kind && row.entidade_id === entityId)
      .sort((left, right) => Number(right.status === "pendente") - Number(left.status === "pendente") || right.created_at.localeCompare(left.created_at));
  }

  async findOne(kind: CreateSuggestionInput["entidadeTipo"], entityId: string, suggestionId: string): Promise<SuggestionRow | null> {
    return this.rows.find((row) => row.id === suggestionId && row.entidade_tipo === kind && row.entidade_id === entityId) ?? null;
  }

  async create(input: CreateSuggestionInput): Promise<SuggestionRow> {
    if (!this.entities.has(input.entidadeId)) throw new NotFoundError();
    const existingPending = this.rows.find((row) => row.status === "pendente" && row.entidade_tipo === input.entidadeTipo && row.entidade_id === input.entidadeId && row.campo === input.campo);
    if (existingPending) {
      existingPending.valor_sugerido = input.valorSugerido;
      existingPending.origem = input.origem;
      existingPending.criado_por = input.usuarioId;
      existingPending.updated_at = new Date().toISOString();
      return existingPending;
    }
    const row: SuggestionRow = {
      id: this.nextId(),
      entidade_tipo: input.entidadeTipo,
      entidade_id: input.entidadeId,
      campo: input.campo,
      valor_sugerido: input.valorSugerido,
      valor_resolvido: null,
      origem: input.origem,
      status: "pendente",
      criado_por: input.usuarioId,
      criado_por_nome: "Ana PO",
      resolvido_por: null,
      resolvido_por_nome: null,
      resolvido_em: null,
      created_at: new Date(Date.UTC(2026, 8, 25, 10, this.sequence)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 8, 25, 10, this.sequence)).toISOString(),
    };
    this.rows.push(row);
    return row;
  }

  async resolve(input: ResolveSuggestionInput): Promise<SuggestionRow> {
    const row = this.rows.find((item) => item.id === input.suggestionId && item.entidade_tipo === input.entidadeTipo && item.entidade_id === input.entidadeId);
    if (!row) throw new NotFoundError("Sugestão não encontrada.");

    if (row.status !== "pendente") {
      const sameOutcome = row.status === input.resolution && (input.resolution === "descartada" || row.valor_resolvido === input.valor);
      if (sameOutcome) return row;
      throw new ConflictError(`Esta sugestão já foi ${row.status} anteriormente; nenhuma nova ação foi aplicada.`);
    }

    if (input.resolution !== "descartada") {
      if (this.archived.has(input.entidadeId)) throw new ArchiveConflict("Item ou ancestral arquivado está disponível apenas para leitura.");
      if (this.requiresJustification.has(input.entidadeId) && !input.justificativa?.trim()) {
        throw new ValidationError("A justificativa é obrigatória ao alterar um item concluído.");
      }
    }

    row.status = input.resolution;
    row.valor_resolvido = input.resolution === "descartada" ? null : input.valor;
    row.resolvido_por = input.usuarioId;
    row.resolvido_por_nome = "Ana PO";
    row.resolvido_em = new Date().toISOString();
    row.updated_at = row.resolvido_em;
    return row;
  }
}
