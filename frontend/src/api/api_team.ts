import { apiRequest } from "./api_auth";

export interface TeamTechnology { id: string; nome: string }

export interface TeamProjectExperience {
  projeto_id: string;
  projeto_nome: string;
  papeis: string[];
  em_andamento: boolean;
  tecnologias: TeamTechnology[];
}

export interface TeamProfessional {
  desenvolvedor_id: string;
  nome: string;
  senioridade: string | null;
  competencias: Array<{ tecnologia_id: string; tecnologia_nome: string; nivel: string; evidencia: string | null }>;
  projetos: TeamProjectExperience[];
}

export interface TeamExperienceAnswer {
  resposta: string;
  encontrado: boolean;
  tecnologias: TeamTechnology[];
  profissionais: TeamProfessional[];
}

export async function whoWorkedWith(technology: string, signal?: AbortSignal): Promise<TeamExperienceAnswer> {
  const response = await apiRequest(`/team/experience?tecnologia=${encodeURIComponent(technology)}`, { signal });
  const data = (await response.json()) as Partial<TeamExperienceAnswer>;
  return {
    resposta: typeof data.resposta === "string" ? data.resposta : "",
    encontrado: data.encontrado === true,
    tecnologias: Array.isArray(data.tecnologias) ? data.tecnologias : [],
    profissionais: Array.isArray(data.profissionais) ? data.profissionais : [],
  };
}
