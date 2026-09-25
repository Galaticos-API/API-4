import { z } from "zod";

// Historical ativo remains writable; only dedicated operations complete or archive items.
export const EPIC_STATUSES = ["rascunho", "concluido", "ativo", "arquivado"] as const;
export type EpicStatus = (typeof EPIC_STATUSES)[number];

export const EPIC_PRIORITIES = ["Must", "Should", "Could"] as const;
export type EpicPriority = (typeof EPIC_PRIORITIES)[number];

export const EPIC_REQUIRED_FIELDS = ["descricao", "objetivo", "escopo_macro", "resultado_esperado"] as const;

const uuidField = (label: string) => z.string({ required_error: `${label} é obrigatório.` }).uuid(`${label} deve ser um UUID válido.`);

export const createEpicSchema = z.object({
  projeto_id: uuidField("O projeto"),
  titulo: z
    .string({ required_error: "O título do épico é obrigatório." })
    .trim()
    .min(1, "O título do épico é obrigatório.")
    .max(255, "O título não pode exceder 255 caracteres."),
  descricao: z.string().trim().optional().nullable(),
  objetivo: z.string().trim().optional().nullable(),
  escopo_macro: z.string().trim().optional().nullable(),
  resultado_esperado: z.string().trim().optional().nullable(),
  tecnologias_ids: z.array(z.string().uuid()).max(50).optional(),
  prioridade: z.enum(EPIC_PRIORITIES).default("Must"),
  status: z.literal("rascunho").optional(),
});

export type CreateEpicDTO = z.infer<typeof createEpicSchema>;

export const updateEpicSchema = z.object({
  titulo: z.string().trim().min(1, "O título do épico não pode ser vazio.").max(255, "O título não pode exceder 255 caracteres.").optional(),
  descricao: z.string().trim().optional().nullable(),
  objetivo: z.string().trim().optional().nullable(),
  escopo_macro: z.string().trim().optional().nullable(),
  resultado_esperado: z.string().trim().optional().nullable(),
  prioridade: z.enum(EPIC_PRIORITIES).optional(),
  justificativa: z.string().trim().optional().nullable(),
  tecnologias_ids: z.array(z.string().uuid()).max(50).optional(),
  status: z.never().optional(),
});

export type UpdateEpicDTO = z.infer<typeof updateEpicSchema>;

export const epicQuerySchema = z.object({
  projeto_id: z.string().uuid().optional(),
  status: z.enum([...EPIC_STATUSES, "todos"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type EpicQueryDTO = z.infer<typeof epicQuerySchema>;

export interface Epic {
  id: string;
  projeto_id: string;
  titulo: string;
  descricao: string | null;
  objetivo: string | null;
  escopo_macro: string | null;
  resultado_esperado: string | null;
  tecnologias_ids?: string[];
  prioridade: EpicPriority;
  status: EpicStatus;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface EpicWithStats extends Epic {
  features_count?: number;
  criterios_count?: number;
  projeto_status?: string;
}

export interface PaginatedEpics {
  items: EpicWithStats[];
  total: number;
  limit: number;
  offset: number;
}
