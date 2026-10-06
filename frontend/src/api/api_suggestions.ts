import { ApiError, apiRequest } from "./api_auth";
import { serverMessage } from "./api_errors";

export type SuggestionKind = "epico" | "feature" | "pbi";
export type SuggestionStatus = "pendente" | "aceita" | "editada" | "descartada";

export interface Suggestion {
  id: string;
  entidade_tipo: SuggestionKind;
  entidade_id: string;
  campo: string;
  valor_sugerido: string;
  valor_resolvido: string | null;
  origem: string;
  status: SuggestionStatus;
  criado_por: string | null;
  criado_por_nome: string | null;
  resolvido_por: string | null;
  resolvido_por_nome: string | null;
  resolvido_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSuggestionInput {
  campo: string;
  valor_sugerido: string;
  origem?: string;
}

const PATHS: Record<SuggestionKind, string> = {
  epico: "epics",
  feature: "features",
  pbi: "pbis",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parseSuggestion(value: unknown): Suggestion {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.campo !== "string"
    || typeof value.valor_sugerido !== "string" || typeof value.status !== "string"
    || typeof value.created_at !== "string" || typeof value.updated_at !== "string") {
    throw new Error("Sugestão inválida");
  }
  return {
    id: value.id,
    entidade_tipo: value.entidade_tipo as SuggestionKind,
    entidade_id: String(value.entidade_id),
    campo: value.campo,
    valor_sugerido: value.valor_sugerido,
    valor_resolvido: asNullableString(value.valor_resolvido),
    origem: typeof value.origem === "string" ? value.origem : "manual",
    status: value.status as SuggestionStatus,
    criado_por: asNullableString(value.criado_por),
    criado_por_nome: asNullableString(value.criado_por_nome),
    resolvido_por: asNullableString(value.resolvido_por),
    resolvido_por_nome: asNullableString(value.resolvido_por_nome),
    resolvido_em: asNullableString(value.resolvido_em),
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

export async function listSuggestions(kind: SuggestionKind, id: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const data: unknown = await (await apiRequest(`/${PATHS[kind]}/${encodeURIComponent(id)}/suggestions`, { signal })).json();
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error("Lista de sugestões inválida");
  return data.items.map(parseSuggestion);
}

export async function createSuggestion(kind: SuggestionKind, id: string, input: CreateSuggestionInput, signal?: AbortSignal): Promise<Suggestion> {
  const response = await apiRequest(`/${PATHS[kind]}/${encodeURIComponent(id)}/suggestions`, {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });
  return parseSuggestion(await response.json());
}

export async function acceptSuggestion(kind: SuggestionKind, id: string, suggestionId: string, justificativa?: string, signal?: AbortSignal): Promise<Suggestion> {
  const response = await apiRequest(`/${PATHS[kind]}/${encodeURIComponent(id)}/suggestions/${encodeURIComponent(suggestionId)}/accept`, {
    method: "POST",
    body: JSON.stringify(justificativa?.trim() ? { justificativa: justificativa.trim() } : {}),
    signal,
  });
  return parseSuggestion(await response.json());
}

export async function editSuggestion(kind: SuggestionKind, id: string, suggestionId: string, valor: string, justificativa?: string, signal?: AbortSignal): Promise<Suggestion> {
  const response = await apiRequest(`/${PATHS[kind]}/${encodeURIComponent(id)}/suggestions/${encodeURIComponent(suggestionId)}/edit`, {
    method: "POST",
    body: JSON.stringify(justificativa?.trim() ? { valor, justificativa: justificativa.trim() } : { valor }),
    signal,
  });
  return parseSuggestion(await response.json());
}

export async function discardSuggestion(kind: SuggestionKind, id: string, suggestionId: string, signal?: AbortSignal): Promise<Suggestion> {
  const response = await apiRequest(`/${PATHS[kind]}/${encodeURIComponent(id)}/suggestions/${encodeURIComponent(suggestionId)}/discard`, {
    method: "POST",
    signal,
  });
  return parseSuggestion(await response.json());
}

export function describeSuggestionError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
    if (error.status === 403) return "Seu perfil não permite decidir sobre sugestões.";
    if (error.status === 404) return "A sugestão ou o item não foram encontrados. Atualize a página.";
    if (error.status === 409) return serverMessage(error) ?? "Esta sugestão já foi resolvida de outra forma.";
    if (error.status === 400) return serverMessage(error) ?? "Revise o valor informado.";
  }
  return "Não foi possível concluir a ação. Tente novamente.";
}
