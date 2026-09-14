import { apiRequest } from "./http";

export interface ProjectInput { nome: string; cliente: string; descricao: string }
export interface Project extends ProjectInput { id: string; status: "ativo" | "arquivado" }

function parseProject(value: unknown): Project {
  if (!value || typeof value !== "object") throw new Error("Projeto inválido");
  const project = value as Record<string, unknown>;
  if (typeof project.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(project.id)
    || typeof project.nome !== "string" || typeof project.cliente !== "string"
    || typeof project.descricao !== "string" || !["ativo", "arquivado"].includes(String(project.status))) {
    throw new Error("Resposta de projeto inválida");
  }
  return project as unknown as Project;
}

export async function listProjects(signal: AbortSignal): Promise<Project[]> {
  const data = await (await apiRequest("/projects", { signal })).json();
  if (!Array.isArray(data.projects)) throw new Error("Lista de projetos inválida");
  return data.projects.map(parseProject);
}

export async function getProject(id: string, signal: AbortSignal): Promise<Project> {
  const data = await (await apiRequest(`/projects/${encodeURIComponent(id)}`, { signal })).json();
  return parseProject(data.project);
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const data = await (await apiRequest("/projects", { method: "POST", body: JSON.stringify(input) })).json();
  return parseProject(data.project);
}
