import { z } from "zod";

export const PBI_STATUSES = ["rascunho", "concluido"] as const;
export type PbiStatus = (typeof PBI_STATUSES)[number];

export const PBI_PRIORITIES = ["Must", "Should", "Could"] as const;
export type PbiPriority = (typeof PBI_PRIORITIES)[number];

export const createPbiSchema = z.object({
  feature_id: z.string({ required_error: "A feature é obrigatória." }).uuid("A feature deve ser um UUID válido."),
  titulo: z
    .string({ required_error: "O título do PBI é obrigatório." })
    .trim()
    .min(1, "O título do PBI é obrigatório.")
    .max(255, "O título não pode exceder 255 caracteres."),
  historia_como_um: z
    .string({ required_error: "O bloco COMO UM é obrigatório." })
    .trim()
    .min(1, "O bloco COMO UM é obrigatório."),
  historia_eu_quero: z
    .string({ required_error: "O bloco EU QUERO é obrigatório." })
    .trim()
    .min(1, "O bloco EU QUERO é obrigatório."),
  historia_para_que: z
    .string({ required_error: "O bloco PARA QUE é obrigatório." })
    .trim()
    .min(1, "O bloco PARA QUE é obrigatório."),
  regras_observacoes: z.string().trim().optional().nullable(),
  tipo: z.string().trim().min(1).max(50).default("Funcional"),
  prioridade: z.enum(PBI_PRIORITIES).default("Must"),
  requer_interface: z.boolean().default(false),
});

export type CreatePbiDTO = z.infer<typeof createPbiSchema>;

export const updatePbiSchema = z.object({
  titulo: z.string().trim().min(1, "O título do PBI não pode ser vazio.").max(255, "O título não pode exceder 255 caracteres.").optional(),
  historia_como_um: z.string().trim().min(1, "O bloco COMO UM não pode ser vazio.").optional(),
  historia_eu_quero: z.string().trim().min(1, "O bloco EU QUERO não pode ser vazio.").optional(),
  historia_para_que: z.string().trim().min(1, "O bloco PARA QUE não pode ser vazio.").optional(),
  regras_observacoes: z.string().trim().optional().nullable(),
  tipo: z.string().trim().min(1).max(50).optional(),
  prioridade: z.enum(PBI_PRIORITIES).optional(),
  requer_interface: z.boolean().optional(),
  justificativa: z.string().trim().max(2000, "A justificativa não pode exceder 2000 caracteres.").optional().nullable(),
});

export type UpdatePbiDTO = z.infer<typeof updatePbiSchema>;

export const pbiQuerySchema = z.object({
  feature_id: z.string().uuid().optional(),
  status: z.enum(PBI_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PbiQueryDTO = z.infer<typeof pbiQuerySchema>;

export interface Pbi {
  id: string;
  feature_id: string;
  codigo: string;
  titulo: string;
  historia_como_um: string;
  historia_eu_quero: string;
  historia_para_que: string;
  regras_observacoes: string | null;
  tipo: string;
  prioridade: PbiPriority;
  requer_interface: boolean;
  prototipo_vinculado?: boolean;
  status: PbiStatus;
  score_completude: number | null;
  provenance: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface PbiWithContext extends Pbi {
  criterios_count?: number;
  feature_titulo?: string;
  epico_id?: string;
  epico_titulo?: string;
  projeto_id?: string;
  projeto_status?: string;
}

export interface PaginatedPbis {
  items: PbiWithContext[];
  total: number;
  limit: number;
  offset: number;
}
