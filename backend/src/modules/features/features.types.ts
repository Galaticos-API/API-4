import { z } from "zod";

export const FEATURE_STATUSES = ["rascunho", "concluido", "arquivado"] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];

export const FEATURE_PRIORITIES = ["Must", "Should", "Could"] as const;
export type FeaturePriority = (typeof FEATURE_PRIORITIES)[number];

export const FEATURE_REQUIRED_FIELDS = ["descricao", "objetivo"] as const;

export const createFeatureSchema = z.object({
  epico_id: z.string({ required_error: "O épico é obrigatório." }).uuid("O épico deve ser um UUID válido."),
  titulo: z
    .string({ required_error: "O título da feature é obrigatório." })
    .trim()
    .min(1, "O título da feature é obrigatório.")
    .max(255, "O título não pode exceder 255 caracteres."),
  descricao: z.string().trim().optional().nullable(),
  objetivo: z.string().trim().optional().nullable(),
  prioridade: z.enum(FEATURE_PRIORITIES).default("Must"),
});

export type CreateFeatureDTO = z.infer<typeof createFeatureSchema>;

export const updateFeatureSchema = z.object({
  titulo: z.string().trim().min(1, "O título da feature não pode ser vazio.").max(255, "O título não pode exceder 255 caracteres.").optional(),
  descricao: z.string().trim().optional().nullable(),
  objetivo: z.string().trim().optional().nullable(),
  prioridade: z.enum(FEATURE_PRIORITIES).optional(),
  justificativa: z.string().trim().optional().nullable(),
});

export type UpdateFeatureDTO = z.infer<typeof updateFeatureSchema>;

export const featureQuerySchema = z.object({
  epico_id: z.string().uuid().optional(),
  status: z.enum([...FEATURE_STATUSES, "todos"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type FeatureQueryDTO = z.infer<typeof featureQuerySchema>;

export interface Feature {
  id: string;
  epico_id: string;
  titulo: string;
  descricao: string | null;
  objetivo: string | null;
  prioridade: FeaturePriority;
  status: FeatureStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface FeatureWithStats extends Feature {
  pbis_count?: number;
  criterios_count?: number;
  epico_titulo?: string;
  projeto_id?: string;
  projeto_status?: string;
}

export interface PaginatedFeatures {
  items: FeatureWithStats[];
  total: number;
  limit: number;
  offset: number;
}
