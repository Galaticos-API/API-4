import { apiRequest } from "./api_auth";

export interface ProjectInput { nome: string; cliente: string; descricao: string }
export interface Project extends ProjectInput { id: string; status: "ativo" | "em_andamento" | "concluido" | "arquivado"; archived_at?: string | null; documentos_count?: number }
export interface ArchiveImpact { projeto: number; epicos: number; features: number; pbis: number }

export async function getArchiveImpact(id: string): Promise<ArchiveImpact> {
  const data = await (await apiRequest(`/projects/${encodeURIComponent(id)}/archive-impact`)).json();
  if (!data || !["projeto", "epicos", "features", "pbis"].every(key => Number.isInteger(data[key]) && data[key] >= 0)) throw new Error("Prévia inválida");
  return data;
}

export async function archiveProject(id: string, impacto: ArchiveImpact): Promise<Project> {
  return parseProject(await (await apiRequest(`/projects/${encodeURIComponent(id)}/archive`, {
    method: "PATCH", body: JSON.stringify({ confirmado: true, impacto }),
  })).json());
}

function parseProject(value: unknown): Project {
  if (!value || typeof value !== "object") throw new Error("Projeto inválido");
  const project = value as Record<string, unknown>;
  if (typeof project.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(project.id)
    || typeof project.nome !== "string" || typeof project.cliente !== "string"
    || !(project.descricao === null || typeof project.descricao === "string")
    || !["ativo", "em_andamento", "concluido", "arquivado"].includes(String(project.status))) {
    throw new Error("Resposta de projeto inválida");
  }
  return { ...project, descricao: project.descricao ?? "" } as unknown as Project;
}

export interface ProjectPage { projects: Project[]; total: number; limit: number; offset: number }

export async function listProjects(signal: AbortSignal, offset = 0, status = ""): Promise<ProjectPage> {
  const data = await (await apiRequest(`/projects?limit=50&offset=${offset}${status ? `&status=${encodeURIComponent(status)}` : ""}`, { signal })).json();
  if (!Array.isArray(data.items)) throw new Error("Lista de projetos inválida");
  if (!Number.isInteger(data.total) || data.total < 0 || data.limit !== 50 || data.offset !== offset) throw new Error("Paginação inválida");
  return { projects: data.items.map(parseProject), total: data.total, limit: data.limit, offset: data.offset };
}

export async function getProject(id: string, signal: AbortSignal): Promise<Project> {
  const data = await (await apiRequest(`/projects/${encodeURIComponent(id)}`, { signal })).json();
  return parseProject(data);
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const data = await (await apiRequest("/projects", { method: "POST", body: JSON.stringify(input) })).json();
  return parseProject(data);
}