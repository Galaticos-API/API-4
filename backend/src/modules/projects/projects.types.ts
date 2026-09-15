import { z } from "zod";

export const PROJECT_STATUSES = ["ativo", "em_andamento", "concluido", "arquivado"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const createProjectSchema = z.object({
  nome: z
    .string({ required_error: "O nome do projeto é obrigatório." })
    .trim()
    .min(1, "O nome do projeto é obrigatório.")
    .max(255, "O nome não pode exceder 255 caracteres."),
  cliente: z
    .string({ required_error: "O nome do cliente é obrigatório." })
    .trim()
    .min(1, "O nome do cliente é obrigatório.")
    .max(255, "O cliente não pode exceder 255 caracteres."),
  descricao: z.string().trim().optional().nullable(),
  status: z.enum(PROJECT_STATUSES).default("ativo"),
  data_inicio: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Data de início deve ser uma data válida.",
    })
    .optional()
    .nullable(),
});

export type CreateProjectDTO = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "O nome do projeto não pode ser vazio.")
    .max(255, "O nome não pode exceder 255 caracteres.")
    .optional(),
  cliente: z
    .string()
    .trim()
    .min(1, "O cliente não pode ser vazio.")
    .max(255, "O cliente não pode exceder 255 caracteres.")
    .optional(),
  descricao: z.string().trim().optional().nullable(),
  status: z.enum(PROJECT_STATUSES).optional(),
  data_inicio: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Data de início deve ser uma data válida.",
    })
    .optional()
    .nullable(),
  justificativa: z.string().trim().optional().nullable(),
});

export type UpdateProjectDTO = z.infer<typeof updateProjectSchema>;

export const projectQuerySchema = z.object({
  status: z.string().optional(),
  busca: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  order: z.enum(["created_at_desc", "created_at_asc", "nome_asc", "nome_desc"]).default("created_at_desc"),
});

export type ProjectQueryDTO = z.infer<typeof projectQuerySchema>;

export interface Project {
  id: string;
  nome: string;
  cliente: string;
  descricao: string | null;
  status: ProjectStatus;
  data_inicio: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ProjectWithStats extends Project {
  epicos_count?: number;
  documentos_count?: number;
}

export interface PaginatedProjects {
  items: ProjectWithStats[];
  total: number;
  limit: number;
  offset: number;
}
