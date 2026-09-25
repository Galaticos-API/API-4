import { ApiError, apiRequest } from "./api_auth";
import { serverMessage } from "./api_errors";

export type DecisionKind = "projeto" | "epico" | "feature" | "pbi";

export interface DecisionNode {
  tipo: DecisionKind;
  id: string;
  titulo: string;
  codigo: string | null;
}

export interface Decision {
  id: string;
  titulo: string;
  contexto: string;
  decisao: string;
  justificativa: string;
  alternativas: string | null;
  autor: { id: string; nome: string } | null;
  created_at: string;
  origem: DecisionNode & { herdada: boolean };
}

export interface DecisionList {
  entidade: DecisionNode;
  ancestrais: DecisionNode[];
  decisoes: Decision[];
}

export interface DecisionInput {
  titulo: string;
  contexto: string;
  decisao: string;
  justificativa: string;
  alternativas: string;
}

const PATHS: Record<DecisionKind, string> = {
  projeto: "projects",
  epico: "epics",
  feature: "features",
  pbi: "pbis",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseNode(value: unknown): DecisionNode {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.titulo !== "string" || !Object.keys(PATHS).includes(String(value.tipo))) {
    throw new Error("Nó de decisão inválido");
  }
  return { tipo: value.tipo as DecisionKind, id: value.id, titulo: value.titulo, codigo: typeof value.codigo === "string" ? value.codigo : null };
}

export function parseDecision(value: unknown): Decision {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.titulo !== "string" || typeof value.contexto !== "string"
    || typeof value.decisao !== "string" || typeof value.justificativa !== "string" || typeof value.created_at !== "string"
    || !isRecord(value.origem)) {
    throw new Error("Decisão inválida");
  }
  const author = value.autor;
  return {
    id: value.id,
    titulo: value.titulo,
    contexto: value.contexto,
    decisao: value.decisao,
    justificativa: value.justificativa,
    alternativas: typeof value.alternativas === "string" ? value.alternativas : null,
    autor: isRecord(author) && typeof author.id === "string" && typeof author.nome === "string" ? { id: author.id, nome: author.nome } : null,
    created_at: value.created_at,
    origem: { ...parseNode(value.origem), herdada: value.origem.herdada === true },
  };
}

export async function listDecisions(kind: DecisionKind, id: string, signal?: AbortSignal): Promise<DecisionList> {
  const data: unknown = await (await apiRequest(`/${PATHS[kind]}/${encodeURIComponent(id)}/decisions`, { signal })).json();
  if (!isRecord(data) || !Array.isArray(data.decisoes) || !Array.isArray(data.ancestrais)) throw new Error("Lista de decisões inválida");
  return { entidade: parseNode(data.entidade), ancestrais: data.ancestrais.map(parseNode), decisoes: data.decisoes.map(parseDecision) };
}

export async function createDecision(kind: DecisionKind, id: string, input: DecisionInput, signal?: AbortSignal): Promise<Decision> {
  const response = await apiRequest(`/${PATHS[kind]}/${encodeURIComponent(id)}/decisions`, {
    method: "POST",
    body: JSON.stringify({ ...input, alternativas: input.alternativas.trim() || null }),
    signal,
  });
  return parseDecision(await response.json());
}

export function describeDecisionError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para registrar a decisão.";
    if (error.status === 403) return "Seu perfil não permite registrar decisões.";
    if (error.status === 404) return "O item não foi encontrado. Atualize a página.";
    if (error.status === 409) return serverMessage(error) ?? "O item está arquivado e não recebe novas decisões.";
    if (error.status === 400) return serverMessage(error) ?? "Revise os campos da decisão.";
  }
  return "Não foi possível registrar a decisão. O texto foi mantido; tente novamente.";
}
