import { z } from "zod";
import { SUGGESTIBLE_FIELDS, type SuggestibleEntityType } from "../provenance/provenance.js";
import type { SuggestionRow } from "../suggestions/suggestions.types.js";

export type SimilarEntityType = SuggestibleEntityType;
export const SIMILAR_ENTITY_TYPES = ["epico", "feature", "pbi"] as const;

export const SIMILAR_RELATION_TYPE = "reaproveitado_de";
export const MIN_DRAFT_LENGTH = 15;
export const MAX_SIMILAR_RESULTS = 5;

export const similarOriginLabel = (tipo: SimilarEntityType, origemId: string): string => `similar:${tipo}:${origemId}`;

export interface SimilarItemRow {
  tipo: SimilarEntityType;
  id: string;
  codigo: string | null;
  titulo: string;
  status: string;
  similaridade: number;
  trecho: string;
  projeto_id: string;
  projeto_nome: string;
  epico_id: string | null;
  epico_titulo: string | null;
  feature_id: string | null;
  feature_titulo: string | null;
  ja_aproveitado: boolean;
}

export interface SimilarItem {
  tipo: SimilarEntityType;
  id: string;
  codigo: string | null;
  titulo: string;
  status: string;
  similaridade: number;
  trecho: string;
  projeto: { id: string; nome: string };
  outro_projeto: boolean;
  caminho: Array<{ tipo: SimilarEntityType; id: string; titulo: string }>;
  origem: string;
  ja_aproveitado: boolean;
}

export interface SimilarSearchResult {
  items: SimilarItem[];
  total: number;
  // true quando o serviço de embeddings não respondeu: a escrita segue normalmente
  degradado: boolean;
}

export interface FindSimilarInput {
  tipo: SimilarEntityType;
  vector: number[];
  usuarioId: string;
  projetoId: string;
  excluirId: string | null;
  minimoSimilaridade: number;
  limite: number;
}

export interface ReuseInput {
  tipo: SimilarEntityType;
  destinoId: string;
  origemId: string;
  campos: string[] | null;
  usuarioId: string;
}

export interface ReuseRelation {
  id: string;
  tipo_relacao: string;
  destino_tipo: SimilarEntityType;
  destino_id: string;
  destino_projeto_id: string;
  origem_tipo: SimilarEntityType;
  origem_id: string;
  origem_projeto_id: string;
  campos: string[];
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReuseResult {
  relacao: ReuseRelation;
  sugestoes: SuggestionRow[];
}

export const draftSearchSchema = z.object({
  tipo: z.enum(SIMILAR_ENTITY_TYPES, { required_error: "O tipo do item é obrigatório.", invalid_type_error: "Tipo de item inválido." }),
  titulo: z.string().trim().max(255, "O título pode ter no máximo 255 caracteres.").optional(),
  descricao: z.string().trim().max(5000, "A descrição pode ter no máximo 5000 caracteres.").optional(),
  excluir_id: z.string().optional(),
}).strict();

export function reuseSchema(tipo: SimilarEntityType) {
  const fields = SUGGESTIBLE_FIELDS[tipo];
  return z.object({
    campos: z.array(z.enum(fields as [string, ...string[]], {
      invalid_type_error: `Campo inválido para ${tipo}. Use um de: ${fields.join(", ")}.`,
    })).min(1, "Informe ao menos um campo.").max(fields.length).optional(),
  }).strict();
}
