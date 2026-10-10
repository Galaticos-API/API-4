import { z } from "zod";
import { maxLengthFor, SUGGESTIBLE_FIELDS, type SuggestibleEntityType } from "../provenance/provenance.js";

export type { SuggestibleEntityType } from "../provenance/provenance.js";

export const SUGGESTION_STATUSES = ["pendente", "aceita", "editada", "descartada"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

// Target of a resolve call; "descartada" never writes to the entity table.
export type SuggestionResolution = "aceita" | "editada" | "descartada";

export interface SuggestionRow {
  id: string;
  entidade_tipo: SuggestibleEntityType;
  entidade_id: string;
  campo: string;
  valor_sugerido: string;
  valor_resolvido: string | null;
  origem: string;
  status: SuggestionStatus;
  criado_por: string | null;
  criado_por_nome: string | null;
  resolvido_por: string | null;
  resolvido_por_nome: string | null;
  resolvido_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSuggestionInput {
  entidadeTipo: SuggestibleEntityType;
  entidadeId: string;
  campo: string;
  valorSugerido: string;
  origem: string;
  usuarioId: string | null;
}

export interface ResolveSuggestionInput {
  entidadeTipo: SuggestibleEntityType;
  entidadeId: string;
  suggestionId: string;
  resolution: SuggestionResolution;
  valor: string | null;
  justificativa: string | null;
  usuarioId: string | null;
}

const LABELS: Record<SuggestibleEntityType, string> = { epico: "épico", feature: "feature", pbi: "PBI" };

export function campoSchema(kind: SuggestibleEntityType) {
  const fields = SUGGESTIBLE_FIELDS[kind];
  return z.enum(fields as [string, ...string[]], {
    required_error: "O campo da sugestão é obrigatório.",
    invalid_type_error: `Campo inválido para sugestão em ${LABELS[kind]}. Use um de: ${fields.join(", ")}.`,
  });
}

export function createSuggestionSchema(kind: SuggestibleEntityType) {
  return z.object({
    campo: campoSchema(kind),
    valor_sugerido: z
      .string({ required_error: "O valor sugerido é obrigatório.", invalid_type_error: "O valor sugerido deve ser texto." })
      .trim()
      .min(1, "O valor sugerido é obrigatório."),
    origem: z.string().trim().max(100).optional(),
  }).strict().superRefine((data, ctx) => {
    const max = maxLengthFor(data.campo);
    if (data.valor_sugerido.length > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valor_sugerido"], message: `O valor sugerido pode ter no máximo ${max} caracteres.` });
    }
  });
}

export const resolveDiscardSchema = z.object({}).strict();

export const resolveAcceptSchema = z.object({
  justificativa: z.string().trim().max(2000).optional().nullable(),
}).strict();

export function resolveEditSchema(campo: string) {
  const max = maxLengthFor(campo);
  return z.object({
    valor: z
      .string({ required_error: "Informe o valor editado.", invalid_type_error: "O valor editado deve ser texto." })
      .trim()
      .min(1, "Informe o valor editado.")
      .max(max, `O valor editado pode ter no máximo ${max} caracteres.`),
    justificativa: z.string().trim().max(2000).optional().nullable(),
  }).strict();
}
