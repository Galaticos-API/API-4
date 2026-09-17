import { z } from "zod";

export const CRITERION_ENTITY_TYPES = ["epico", "feature", "pbi"] as const;
export type CriterionEntityType = (typeof CRITERION_ENTITY_TYPES)[number];

const textCriterionShape = {
  texto: z
    .string({ required_error: "O texto do critério é obrigatório." })
    .trim()
    .min(1, "O texto do critério é obrigatório.")
    .max(1000, "O texto não pode exceder 1000 caracteres."),
};

const epicoCriterionSchema = z.object({
  entidade_tipo: z.literal("epico"),
  entidade_id: z.string({ required_error: "A entidade é obrigatória." }).uuid("A entidade deve ser um UUID válido."),
  ...textCriterionShape,
});

const featureCriterionSchema = z.object({
  entidade_tipo: z.literal("feature"),
  entidade_id: z.string({ required_error: "A entidade é obrigatória." }).uuid("A entidade deve ser um UUID válido."),
  ...textCriterionShape,
});

const pbiCriterionSchema = z.object({
  entidade_tipo: z.literal("pbi"),
  entidade_id: z.string({ required_error: "A entidade é obrigatória." }).uuid("A entidade deve ser um UUID válido."),
  nome: z
    .string({ required_error: "O nome do cenário é obrigatório." })
    .trim()
    .min(1, "O nome do cenário é obrigatório.")
    .max(255, "O nome não pode exceder 255 caracteres."),
  dado: z.string({ required_error: "O bloco DADO é obrigatório." }).trim().min(1, "O bloco DADO é obrigatório."),
  quando: z.string({ required_error: "O bloco QUANDO é obrigatório." }).trim().min(1, "O bloco QUANDO é obrigatório."),
  entao: z.string({ required_error: "O bloco ENTÃO é obrigatório." }).trim().min(1, "O bloco ENTÃO é obrigatório."),
});

export const createCriterionSchema = z.discriminatedUnion("entidade_tipo", [
  epicoCriterionSchema,
  featureCriterionSchema,
  pbiCriterionSchema,
]);

export type CreateCriterionDTO = z.infer<typeof createCriterionSchema>;

export const criterionQuerySchema = z.object({
  entidade_tipo: z.enum(CRITERION_ENTITY_TYPES, { required_error: "O tipo de entidade é obrigatório." }),
  entidade_id: z.string({ required_error: "A entidade é obrigatória." }).uuid("A entidade deve ser um UUID válido."),
});

export type CriterionQueryDTO = z.infer<typeof criterionQuerySchema>;

export interface Criterion {
  id: string;
  entidade_tipo: CriterionEntityType;
  entidade_id: string;
  texto: string | null;
  nome: string | null;
  dado: string | null;
  quando: string | null;
  entao: string | null;
  ordem: number;
  created_at: Date | string;
}
