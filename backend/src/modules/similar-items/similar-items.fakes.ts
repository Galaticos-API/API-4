import { ArchiveConflict } from "../projects/archive.types.js";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors.js";
import { SUGGESTIBLE_FIELDS, maxLengthFor } from "../provenance/provenance.js";
import type { SuggestionRow } from "../suggestions/suggestions.types.js";
import type { SearchEmbeddingClient } from "../search/search.service.js";
import { SimilarItemsRepository } from "./similar-items.repository.js";
import {
  SIMILAR_RELATION_TYPE,
  similarOriginLabel,
  type FindSimilarInput,
  type ReuseInput,
  type ReuseRelation,
  type ReuseResult,
  type SimilarItemRow,
} from "./similar-items.types.js";

export const PROJECT_A = "a1000000-0000-4000-8000-000000000001";
export const PROJECT_B = "a1000000-0000-4000-8000-000000000002";
export const UNKNOWN_PROJECT = "a1000000-0000-4000-8000-00000000ffff";
export const TARGET_PBI = "a2000000-0000-4000-8000-000000000001";
export const ORIGIN_PBI = "a2000000-0000-4000-8000-000000000002";
export const ARCHIVED_ORIGIN_PBI = "a2000000-0000-4000-8000-000000000003";
export const UNKNOWN_PBI = "a2000000-0000-4000-8000-00000000ffff";
export const USER = "b0000000-0000-4000-8000-000000000001";

export const VALID_VECTOR = Array.from({ length: 1024 }, (_, index) => (index % 7 === 0 ? 0.5 : 0.1));

export class FakeEmbeddings implements SearchEmbeddingClient {
  public calls: string[] = [];
  public failure: Error | null = null;
  public vector: number[] = VALID_VECTOR;

  async embed(text: string): Promise<number[]> {
    this.calls.push(text);
    if (this.failure) throw this.failure;
    return this.vector;
  }
}

interface FakeOrigin { projeto_id: string; arquivado: boolean; dados: Record<string, unknown> }

export class FakeSimilarItemsRepository extends SimilarItemsRepository {
  public projects = new Set([PROJECT_A, PROJECT_B]);
  public candidates: SimilarItemRow[] = [];
  public lastFind: FindSimilarInput | null = null;
  public archivedTargets = new Set<string>();
  public origins = new Map<string, FakeOrigin>();
  public relations: ReuseRelation[] = [];
  public suggestionRows: SuggestionRow[] = [];
  private sequence = 0;

  constructor() {
    super();
  }

  async projectExists(projectId: string): Promise<boolean> {
    return this.projects.has(projectId);
  }

  async findSimilar(input: FindSimilarInput): Promise<SimilarItemRow[]> {
    this.lastFind = input;
    return this.candidates
      .filter((row) => row.tipo === input.tipo && row.id !== input.excluirId && row.similaridade >= input.minimoSimilaridade)
      .sort((left, right) => right.similaridade - left.similaridade)
      .slice(0, input.limite);
  }

  async reuse(input: ReuseInput): Promise<ReuseResult> {
    if (this.archivedTargets.has(input.destinoId)) {
      throw new ArchiveConflict("Item ou ancestral arquivado está disponível apenas para leitura.");
    }
    const origin = this.origins.get(input.origemId);
    if (!origin) throw new NotFoundError("Item de origem não encontrado.");
    if (origin.arquivado) throw new ConflictError("O item de origem está arquivado e não pode ser aproveitado.");

    const wanted = input.campos ?? [...SUGGESTIBLE_FIELDS[input.tipo]];
    const copied = wanted.flatMap((campo) => {
      const raw = origin.dados[campo];
      const valor = typeof raw === "string" ? raw.trim() : "";
      return valor && valor.length <= maxLengthFor(campo) ? [{ campo, valor }] : [];
    });
    if (copied.length === 0) throw new ValidationError("O item de origem não possui conteúdo aproveitável nos campos selecionados.");

    const sugestoes = copied.map(({ campo, valor }) => {
      const pending = this.suggestionRows.find((row) => row.status === "pendente" && row.entidade_id === input.destinoId && row.campo === campo);
      if (pending) {
        pending.valor_sugerido = valor;
        pending.origem = similarOriginLabel(input.tipo, input.origemId);
        return pending;
      }
      this.sequence += 1;
      const row: SuggestionRow = {
        id: `c1000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`,
        entidade_tipo: input.tipo,
        entidade_id: input.destinoId,
        campo,
        valor_sugerido: valor,
        valor_resolvido: null,
        origem: similarOriginLabel(input.tipo, input.origemId),
        status: "pendente",
        criado_por: input.usuarioId,
        criado_por_nome: "Ana PO",
        resolvido_por: null,
        resolvido_por_nome: null,
        resolvido_em: null,
        created_at: new Date(Date.UTC(2026, 9, 21, 10, this.sequence)).toISOString(),
        updated_at: new Date(Date.UTC(2026, 9, 21, 10, this.sequence)).toISOString(),
      };
      this.suggestionRows.push(row);
      return row;
    });

    const campos = copied.map((item) => item.campo);
    let relacao = this.relations.find((row) => row.destino_id === input.destinoId && row.origem_id === input.origemId);
    if (relacao) {
      relacao.campos = [...new Set([...relacao.campos, ...campos])].sort();
    } else {
      relacao = {
        id: `d1000000-0000-4000-8000-${String(this.relations.length + 1).padStart(12, "0")}`,
        tipo_relacao: SIMILAR_RELATION_TYPE,
        destino_tipo: input.tipo,
        destino_id: input.destinoId,
        destino_projeto_id: PROJECT_A,
        origem_tipo: input.tipo,
        origem_id: input.origemId,
        origem_projeto_id: origin.projeto_id,
        campos: [...campos].sort(),
        criado_por: input.usuarioId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.relations.push(relacao);
    }
    return { relacao, sugestoes };
  }
}

export function similarRow(overrides: Partial<SimilarItemRow> = {}): SimilarItemRow {
  return {
    tipo: "pbi",
    id: ORIGIN_PBI,
    codigo: "PBI-01.1.1",
    titulo: "Validar login com e-mail",
    status: "concluido",
    similaridade: 0.86,
    trecho: "Como um usuário, eu quero entrar com e-mail e senha",
    projeto_id: PROJECT_B,
    projeto_nome: "Portal do Cliente",
    epico_id: "e1000000-0000-4000-8000-000000000001",
    epico_titulo: "Acesso e autenticação",
    feature_id: "f1000000-0000-4000-8000-000000000001",
    feature_titulo: "Login",
    ja_aproveitado: false,
    ...overrides,
  };
}
