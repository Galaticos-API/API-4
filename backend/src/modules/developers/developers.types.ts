import type { UserRole } from "../auth/auth.types.js";

export interface Developer {
  id: string;
  senioridade: string | null;
  bio: string | null;
  nome: string;
  email: string;
  role: UserRole;
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
}

export interface DevelopersOverview {
  desenvolvedores: Developer[];
  tecnologias: DeveloperTechnology[];
  competencias: Competency[];
}
