import type { UserRole } from "../auth/auth.types.js";

export const ALLOWED_SENIORITIES = [
  "Junior",
  "Pleno",
  "Senior",
  "Especialista",
  "Tech Lead",
] as const;

export type DeveloperSeniority = (typeof ALLOWED_SENIORITIES)[number];

export interface Developer {
  id: string;
  nome: string;
  senioridade: string | null;
  bio: string | null;
  usuario_id: string | null;
  usuario_nome: string | null;
  role: UserRole | null;
  competencias_count: number;
  alocacoes_count: number;
  created_at: string;
  updated_at: string;
}

export interface DeveloperTechnology {
  id: string;
  nome: string;
  categoria: string | null;
}

export interface Competency {
  id: string;
  desenvolvedor_id: string;
  tecnologia_id: string;
  nivel: string | null;
  evidencia: string | null;
  tecnologia_nome: string;
  tecnologia_categoria?: string | null;
}

export interface DeveloperAllocation {
  id: string;
  desenvolvedor_id: string;
  projeto_id: string;
  projeto_nome: string;
  projeto_status: string;
  papel: string | null;
  data_inicio: string;
  data_fim: string | null;
  em_andamento: boolean;
}

export interface DeveloperHistoryItem {
  projeto_id: string;
  projeto_nome: string;
  projeto_descricao: string | null;
  projeto_status: string;
  papeis: string[];
  primeira_alocacao: string;
  ultima_alocacao: string | null;
  em_andamento: boolean;
  tecnologias: DeveloperTechnology[];
}

export interface DeveloperConsolidatedProfile {
  id: string;
  nome: string;
  senioridade: string | null;
  bio: string | null;
  usuario_id: string | null;
  usuario_nome: string | null;
  role: UserRole | null;
  created_at: string;
  updated_at: string;
  competencias: Competency[];
  alocacoes: DeveloperAllocation[];
  historico_consolidado: DeveloperHistoryItem[];
}

export interface LinkablePlatformUser {
  id: string;
  nome: string;
  role: UserRole;
  perfil_id: string | null;
}

export interface DevelopersOverview {
  desenvolvedores: Developer[];
  tecnologias: DeveloperTechnology[];
  competencias: Competency[];
}

export interface CreateDeveloperInput {
  nome?: string;
  usuario_id?: string | null;
  senioridade?: string | null;
  bio?: string | null;
}

export interface UpdateDeveloperInput {
  nome?: string;
  usuario_id?: string | null;
  senioridade?: string | null;
  bio?: string | null;
}
