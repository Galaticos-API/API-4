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

export interface TechnologyFit {
  tecnologia: TeamTechnology;
  atendida: boolean;
  justificativas: string[];
}

export interface FeatureRecommendation {
  desenvolvedor_id: string;
  nome: string;
  senioridade: string | null;
  aderencia: number;
  ja_alocado_no_projeto: boolean;
  tecnologias: TechnologyFit[];
  justificativa: string;
}

export interface FeatureRecommendationResult {
  base_suficiente: boolean;
  mensagem: string;
  aviso: string;
  criterio: string;
  tecnologias: TeamTechnology[];
  recomendacoes: FeatureRecommendation[];
}

export async function recommendForFeature(featureId: string, signal?: AbortSignal): Promise<FeatureRecommendationResult> {
  const response = await apiRequest(`/features/${encodeURIComponent(featureId)}/recommendations`, { signal });
  const data = (await response.json()) as Partial<FeatureRecommendationResult>;
  return {
    base_suficiente: data.base_suficiente === true,
    mensagem: typeof data.mensagem === "string" ? data.mensagem : "",
    aviso: typeof data.aviso === "string" ? data.aviso : "Recomendação consultiva: nenhuma alocação é feita automaticamente.",
    criterio: typeof data.criterio === "string" ? data.criterio : "",
    tecnologias: Array.isArray(data.tecnologias) ? data.tecnologias : [],
    recomendacoes: Array.isArray(data.recomendacoes) ? data.recomendacoes : [],
  };
}
