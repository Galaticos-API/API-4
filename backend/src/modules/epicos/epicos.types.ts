import { z } from "zod";

export const EPIC_STATUSES = ["rascunho", "ativo", "concluido", "arquivado"] as const;
export type EpicStatus = (typeof EPIC_STATUSES)[number];

export const createEpicSchema = z.object({
  projeto_id: z.string().trim().min(1, "O projeto do épico é obrigatório."),
  titulo: z.string().trim().min(1, "O título do épico é obrigatório.").max(255, "O título não pode exceder 255 caracteres."),
  descricao: z.string().trim().max(5000).optional().nullable(),
  objetivo: z.string().trim().max(5000).optional().nullable(),
  escopo_macro: z.string().trim().max(5000).optional().nullable(),
  resultado_esperado: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(EPIC_STATUSES).default("rascunho").optional(),
  prioridade: z.enum(["Must", "Should", "Could"]).optional(),
  priorizacao: z.enum(["Must", "Should", "Could"]).optional(),
}).transform((data) => ({
  ...data,
  prioridade: (data.prioridade ?? data.priorizacao ?? "Must") as "Must" | "Should" | "Could",
}));

export const updateEpicSchema = z.object({
  titulo: z.string().trim().min(1, "O título do épico é obrigatório.").max(255, "O título não pode exceder 255 caracteres.").optional(),
  descricao: z.string().trim().max(5000).optional().nullable(),
  objetivo: z.string().trim().max(5000).optional().nullable(),
  escopo_macro: z.string().trim().max(5000).optional().nullable(),
  resultado_esperado: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(EPIC_STATUSES).optional(),
  prioridade: z.enum(["Must", "Should", "Could"]).optional(),
  priorizacao: z.enum(["Must", "Should", "Could"]).optional(),
  justificativa: z.string().trim().max(2000).optional().nullable(),
});

export type CreateEpicDto = z.infer<typeof createEpicSchema>;
export type UpdateEpicDto = {
  titulo?: string;
  descricao?: string | null;
  objetivo?: string | null;
  escopo_macro?: string | null;
  resultado_esperado?: string | null;
  status?: EpicStatus;
  prioridade?: "Must" | "Should" | "Could";
  priorizacao?: "Must" | "Should" | "Could";
  justificativa?: string | null;
};

export interface Epic {
  id: string;
  projeto_id: string;
  titulo: string;
  descricao: string | null;
  objetivo: string | null;
  escopo_macro: string | null;
  resultado_esperado: string | null;
  status: EpicStatus;
  prioridade: "Must" | "Should" | "Could";
  priorizacao?: "Must" | "Should" | "Could";
  missing_fields?: string[];
  created_at: string;
  updated_at: string;
}

export function requiredEpicFields(epico: Partial<Epic>): string[] {
  const missing: string[] = [];
  if (!epico.titulo || !epico.titulo.trim()) missing.push("título");
  if (!epico.descricao || !epico.descricao.trim()) missing.push("descrição");
  if (!epico.objetivo || !epico.objetivo.trim()) missing.push("objetivo");
  if (!epico.escopo_macro || !epico.escopo_macro.trim()) missing.push("escopo macro");
  if (!epico.resultado_esperado || !epico.resultado_esperado.trim()) missing.push("resultado esperado");
  return missing;
}
