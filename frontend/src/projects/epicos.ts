import { apiRequest } from "./http";

export type EpicStatus = "rascunho" | "ativo" | "concluido" | "arquivado";

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
  missing_fields?: string[];
  created_at: string;
  updated_at: string;
}

export interface EpicFormInput {
  titulo: string;
  descricao: string;
  objetivo: string;
  escopo_macro: string;
  resultado_esperado: string;
  status?: EpicStatus;
  prioridade?: "Must" | "Should" | "Could";
}

export function missingEpicFields(epic: Partial<Epic>): string[] {
  const missing: string[] = [];
  if (!epic.titulo || !epic.titulo.trim()) missing.push("título");
  if (!epic.descricao || !epic.descricao.trim()) missing.push("descrição");
  if (!epic.objetivo || !epic.objetivo.trim()) missing.push("objetivo");
  if (!epic.escopo_macro || !epic.escopo_macro.trim()) missing.push("escopo macro");
  if (!epic.resultado_esperado || !epic.resultado_esperado.trim()) missing.push("resultado esperado");
  return missing;
}

export async function listEpicos(projectId: string, signal?: AbortSignal): Promise<Epic[]> {
  const response = await apiRequest(`/projects/${encodeURIComponent(projectId)}/epicos`, { signal });
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Lista de épicos inválida.");
  return data.map((item: any) => ({
    ...item,
    prioridade: item.prioridade ?? item.priorizacao ?? "Must",
    missing_fields: item.missing_fields ?? missingEpicFields(item),
  }));
}

export async function createEpic(projectId: string, input: EpicFormInput): Promise<Epic> {
  const response = await apiRequest(`/projects/${encodeURIComponent(projectId)}/epicos`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  const data = await response.json();
  return {
    ...data,
    prioridade: data.prioridade ?? data.priorizacao ?? "Must",
    missing_fields: data.missing_fields ?? missingEpicFields(data),
  };
}

export async function updateEpic(epicId: string, input: Partial<EpicFormInput>): Promise<Epic> {
  const response = await apiRequest(`/epicos/${encodeURIComponent(epicId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  const data = await response.json();
  return {
    ...data,
    prioridade: data.prioridade ?? data.priorizacao ?? "Must",
    missing_fields: data.missing_fields ?? missingEpicFields(data),
  };
}

export async function completeEpic(epicId: string): Promise<Epic> {
  const response = await apiRequest(`/epicos/${encodeURIComponent(epicId)}/complete`, {
    method: "PATCH",
  });
  const data = await response.json();
  return {
    ...data,
    prioridade: data.prioridade ?? data.priorizacao ?? "Must",
    missing_fields: data.missing_fields ?? missingEpicFields(data),
  };
}
