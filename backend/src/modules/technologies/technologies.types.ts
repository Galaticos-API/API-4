export const TECHNOLOGY_CATEGORIES = [
  "frontend",
  "backend",
  "database",
  "ai",
  "cloud",
  "devops",
  "mobile",
  "outros",
] as const;

export type TechnologyCategory = (typeof TECHNOLOGY_CATEGORIES)[number];

export interface TechnologyUsage {
  competencias: number;
  itens: number;
  total: number;
}

export interface Technology {
  id: string;
  nome: string;
  categoria: string | null;
  uso: TechnologyUsage;
}

export interface CreateTechnologyInput {
  nome: string;
  categoria: TechnologyCategory;
}

export interface UpdateTechnologyInput {
  nome?: string;
  categoria?: TechnologyCategory;
}

/**
 * Espelha a função SQL normalizar_nome_tecnologia (migration 029): o banco é quem garante a
 * unicidade, esta versão serve para mensagens e testes.
 */
export function normalizeTechnologyName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9+#]/g, "");
}
