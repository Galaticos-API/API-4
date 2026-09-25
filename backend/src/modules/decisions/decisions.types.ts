import { z } from "zod";

export type DecisionEntityType = "projeto" | "epico" | "feature" | "pbi";

export interface ChainNode {
  tipo: DecisionEntityType;
  id: string;
  titulo: string;
  codigo: string | null;
}

export interface DecisionRow {
  id: string;
  entidade_tipo: DecisionEntityType;
  entidade_id: string;
  titulo: string;
  contexto: string;
  decisao: string;
  justificativa: string;
  alternativas: string | null;
  autor_id: string | null;
  autor_nome: string | null;
  created_at: string;
}

export interface DecisionRecord {
  id: string;
  titulo: string;
  contexto: string;
  decisao: string;
  justificativa: string;
  alternativas: string | null;
  autor: { id: string; nome: string } | null;
  created_at: string;
  origem: ChainNode & { herdada: boolean };
}

export interface DecisionListResponse {
  entidade: ChainNode;
  ancestrais: ChainNode[];
  decisoes: DecisionRecord[];
}

export interface CreateDecisionInput {
  entidadeTipo: DecisionEntityType;
  entidadeId: string;
  usuarioId: string;
  titulo: string;
  contexto: string;
  decisao: string;
  justificativa: string;
  alternativas: string | null;
}

const required = (label: string, max: number) =>
  z
    .string({ required_error: `${label} é obrigatório.`, invalid_type_error: `${label} deve ser texto.` })
    .trim()
    .min(1, `${label} é obrigatório.`)
    .max(max, `${label} pode ter no máximo ${max} caracteres.`);

export const createDecisionSchema = z
  .object({
    titulo: required("O título", 255).pipe(z.string().min(3, "O título deve ter ao menos 3 caracteres.")),
    contexto: required("O contexto", 5000),
    decisao: required("A decisão", 5000),
    justificativa: required("A justificativa", 5000),
    alternativas: z
      .string({ invalid_type_error: "As alternativas devem ser texto." })
      .trim()
      .max(5000, "As alternativas podem ter no máximo 5000 caracteres.")
      .nullish()
      .transform((value) => (value ? value : null)),
  })
  .strict();

export type CreateDecisionBody = z.infer<typeof createDecisionSchema>;
