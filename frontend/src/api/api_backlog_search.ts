import { ApiError, apiRequest } from "./api_auth";
import { serverMessage } from "./api_errors";

export type BacklogItemType = "epico" | "feature" | "pbi";

export interface SearchPathNode {
  tipo: BacklogItemType;
  id: string;
  titulo: string;
  codigo: string | null;
}

export interface BacklogSearchHit {
  tipo: BacklogItemType;
  id: string;
  titulo: string;
  codigo: string | null;
  status: string;
  campo: "titulo" | "descricao";
  trecho: { texto: string; destaques: Array<[number, number]> };
  caminho: SearchPathNode[];
  tecnologias: Array<{ id: string; nome: string }>;
}

export interface BacklogSearchResult {
  projeto_id: string;
  termo: string;
  total: number;
  limite: number;
  items: BacklogSearchHit[];
}

export const MIN_QUERY_LENGTH = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseHit(value: unknown): BacklogSearchHit {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.titulo !== "string"
    || !["epico", "feature", "pbi"].includes(String(value.tipo))
    || !isRecord(value.trecho) || typeof value.trecho.texto !== "string" || !Array.isArray(value.trecho.destaques)
    || !Array.isArray(value.caminho)) {
    throw new Error("Resultado de busca inválido");
  }
  return {
    tipo: value.tipo as BacklogItemType,
    id: value.id,
    titulo: value.titulo,
    codigo: typeof value.codigo === "string" ? value.codigo : null,
    status: typeof value.status === "string" ? value.status : "",
    campo: value.campo === "descricao" ? "descricao" : "titulo",
    trecho: {
      texto: value.trecho.texto,
      destaques: (value.trecho.destaques as unknown[]).flatMap((range) =>
        Array.isArray(range) && typeof range[0] === "number" && typeof range[1] === "number" ? [[range[0], range[1]] as [number, number]] : []),
    },
    caminho: value.caminho.flatMap((node) =>
      isRecord(node) && typeof node.id === "string" && typeof node.titulo === "string" && ["epico", "feature", "pbi"].includes(String(node.tipo))
        ? [{ tipo: node.tipo as BacklogItemType, id: node.id, titulo: node.titulo, codigo: typeof node.codigo === "string" ? node.codigo : null }]
        : []),
    tecnologias: Array.isArray(value.tecnologias)
      ? value.tecnologias.flatMap((tech) => (isRecord(tech) && typeof tech.id === "string" && typeof tech.nome === "string" ? [{ id: tech.id, nome: tech.nome }] : []))
      : [],
  };
}

export async function searchBacklog(
  projectId: string,
  criteria: { q: string; status?: string; tecnologiaId?: string; limit?: number },
  signal?: AbortSignal,
): Promise<BacklogSearchResult> {
  const params = new URLSearchParams({ q: criteria.q });
  if (criteria.status) params.set("status", criteria.status);
  if (criteria.tecnologiaId) params.set("tecnologia", criteria.tecnologiaId);
  if (criteria.limit) params.set("limit", String(criteria.limit));
  const response = await apiRequest(`/projects/${encodeURIComponent(projectId)}/backlog-search?${params.toString()}`, { signal });
  const data: unknown = await response.json();
  if (!isRecord(data) || !Array.isArray(data.items) || typeof data.total !== "number") throw new Error("Resposta de busca inválida");
  return {
    projeto_id: String(data.projeto_id ?? projectId),
    termo: String(data.termo ?? criteria.q),
    total: data.total,
    limite: typeof data.limite === "number" ? data.limite : data.items.length,
    items: data.items.map(parseHit),
  };
}

export function describeSearchError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return "Projeto não encontrado.";
    if (error.status === 400) return serverMessage(error) ?? "Revise os critérios da busca.";
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para buscar.";
  }
  return "Não foi possível buscar no backlog. Tente novamente.";
}
