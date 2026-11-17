import { apiRequest } from "./api_auth";

export type DeveloperRole = "admin" | "po" | "dev";

export interface DeveloperProfileSummary {
  id: string;
  nome: string;
  senioridade: string | null;
  bio: string | null;
  usuario_id: string | null;
  usuario_nome: string | null;
  role: DeveloperRole | null;
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

export interface DeveloperCompetency {
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
  role: DeveloperRole | null;
  created_at: string;
  updated_at: string;
  competencias: DeveloperCompetency[];
  alocacoes: DeveloperAllocation[];
  historico_consolidado: DeveloperHistoryItem[];
}

export interface LinkablePlatformUser {
  id: string;
  nome: string;
  role: DeveloperRole;
  perfil_id: string | null;
}

export interface DevelopersOverviewResponse {
  desenvolvedores: DeveloperProfileSummary[];
  tecnologias: DeveloperTechnology[];
  competencias: DeveloperCompetency[];
}

export interface DeveloperProfileInput {
  nome?: string;
  usuario_id?: string | null;
  senioridade?: string | null;
  bio?: string | null;
}

export async function listDevelopersOverview(
  signal?: AbortSignal,
): Promise<DevelopersOverviewResponse> {
  const res = await apiRequest("/developers", { signal });
  return (await res.json()) as DevelopersOverviewResponse;
}

export async function listLinkableUsers(
  signal?: AbortSignal,
): Promise<LinkablePlatformUser[]> {
  const res = await apiRequest("/developers/users", { signal });
  const data = (await res.json()) as { items?: LinkablePlatformUser[] };
  return Array.isArray(data.items) ? data.items : [];
}

export async function getDeveloperProfile(
  id: string,
  signal?: AbortSignal,
): Promise<DeveloperConsolidatedProfile> {
  const res = await apiRequest(`/developers/${encodeURIComponent(id)}`, { signal });
  return (await res.json()) as DeveloperConsolidatedProfile;
}

export async function createDeveloperProfile(
  payload: DeveloperProfileInput,
): Promise<DeveloperProfileSummary> {
  const res = await apiRequest("/developers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return (await res.json()) as DeveloperProfileSummary;
}

export async function updateDeveloperProfile(
  id: string,
  payload: DeveloperProfileInput,
): Promise<DeveloperProfileSummary> {
  const res = await apiRequest(`/developers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return (await res.json()) as DeveloperProfileSummary;
}
