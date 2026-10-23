import { ApiError, apiRequest } from "./api_auth";
import { serverMessage } from "./api_errors";
import { parseSuggestion, type Suggestion, type SuggestionKind } from "./api_suggestions";

export type SimilarKind = SuggestionKind;

export interface SimilarPathNode {
  tipo: SimilarKind;
  id: string;
  titulo: string;
}

export interface SimilarItem {
  tipo: SimilarKind;
  id: string;
  codigo: string | null;
  titulo: string;
  status: string;
  similaridade: number;
  trecho: string;
  projeto: { id: string; nome: string };
  outro_projeto: boolean;
  caminho: SimilarPathNode[];
  origem: string;
  ja_aproveitado: boolean;
}

export interface SimilarSearchResult {
  items: SimilarItem[];
  total: number;
  degradado: boolean;
}

export interface SimilarDraft {
  tipo: SimilarKind;
  titulo?: string;
  descricao?: string;
  excluir_id?: string;
}

export interface ReuseRelation {
  id: string;
  tipo_relacao: string;
  destino_tipo: SimilarKind;
  destino_id: string;
  origem_tipo: SimilarKind;
  origem_id: string;
  origem_projeto_id: string;
  campos: string[];
}

export interface ReuseResult {
  relacao: ReuseRelation;
  sugestoes: Suggestion[];
}

const PATHS: Record<SimilarKind, string> = { epico: "epics", feature: "features", pbi: "pbis" };
const KINDS: readonly string[] = ["epico", "feature", "pbi"];

/** Mínimo de texto digitado (título + descrição) antes de consultar o acervo; espelha o backend. */
export const SIMILAR_MIN_DRAFT_LENGTH = 15;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseNode(value: unknown): SimilarPathNode | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.titulo !== "string"
    || typeof value.tipo !== "string" || !KINDS.includes(value.tipo)) return null;
  return { tipo: value.tipo as SimilarKind, id: value.id, titulo: value.titulo };
}

export function parseSimilarItem(value: unknown): SimilarItem {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.titulo !== "string"
    || typeof value.tipo !== "string" || !KINDS.includes(value.tipo)
    || !isRecord(value.projeto) || typeof value.projeto.id !== "string" || typeof value.projeto.nome !== "string") {
    throw new Error("Item semelhante inválido");
  }
  const caminho = Array.isArray(value.caminho)
    ? value.caminho.map(parseNode).filter((node): node is SimilarPathNode => node !== null)
    : [];
  const projeto = { id: value.projeto.id, nome: value.projeto.nome };
  return {
    tipo: value.tipo as SimilarKind,
    id: value.id,
    codigo: typeof value.codigo === "string" ? value.codigo : null,
    titulo: value.titulo,
    status: typeof value.status === "string" ? value.status : "",
    similaridade: Number.isFinite(Number(value.similaridade)) ? Number(value.similaridade) : 0,
    trecho: typeof value.trecho === "string" ? value.trecho : "",
    projeto,
    outro_projeto: value.outro_projeto === true,
    caminho,
    origem: typeof value.origem === "string" && value.origem
      ? value.origem
      : [projeto.nome, ...caminho.map((node) => node.titulo)].join(" › "),
    ja_aproveitado: value.ja_aproveitado === true,
  };
}

export async function searchSimilarItems(projectId: string, draft: SimilarDraft, signal?: AbortSignal): Promise<SimilarSearchResult> {
  const response = await apiRequest(`/projects/${encodeURIComponent(projectId)}/similar-items`, {
    method: "POST",
    body: JSON.stringify(draft),
    signal,
  });
  const data: unknown = await response.json();
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error("Resposta de itens semelhantes inválida");
  const items = data.items.map(parseSimilarItem);
  return { items, total: items.length, degradado: data.degradado === true };
}

export async function reuseSimilarItem(kind: SimilarKind, id: string, origemId: string, campos?: string[], signal?: AbortSignal): Promise<ReuseResult> {
  const response = await apiRequest(`/${PATHS[kind]}/${encodeURIComponent(id)}/similar-items/${encodeURIComponent(origemId)}/reuse`, {
    method: "POST",
    body: JSON.stringify(campos && campos.length > 0 ? { campos } : {}),
    signal,
  });
  const data: unknown = await response.json();
  if (!isRecord(data) || !isRecord(data.relacao) || !Array.isArray(data.sugestoes)) throw new Error("Resposta de aproveitamento inválida");
  const relacao = data.relacao;
  return {
    relacao: {
      id: String(relacao.id),
      tipo_relacao: String(relacao.tipo_relacao),
      destino_tipo: relacao.destino_tipo as SimilarKind,
      destino_id: String(relacao.destino_id),
      origem_tipo: relacao.origem_tipo as SimilarKind,
      origem_id: String(relacao.origem_id),
      origem_projeto_id: String(relacao.origem_projeto_id),
      campos: Array.isArray(relacao.campos) ? relacao.campos.map(String) : [],
    },
    sugestoes: data.sugestoes.map(parseSuggestion),
  };
}

export function describeReuseError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
    if (error.status === 403) return "Seu perfil não permite aproveitar itens de outros projetos.";
    if (error.status === 404) return serverMessage(error) ?? "O item de origem ou de destino não foi encontrado.";
    if (error.status === 409) return serverMessage(error) ?? "O item de origem não pode ser aproveitado no momento.";
    if (error.status === 400) return serverMessage(error) ?? "O item de origem não possui conteúdo aproveitável.";
  }
  return "Não foi possível aproveitar o item. Tente novamente.";
}

export function similarItemPath(item: SimilarItem): string | null {
  const epic = item.caminho.find((node) => node.tipo === "epico");
  const feature = item.caminho.find((node) => node.tipo === "feature");
  const base = `/projects/${item.projeto.id}`;
  if (item.tipo === "epico") return `${base}/epics/${item.id}`;
  if (item.tipo === "feature") return epic ? `${base}/epics/${epic.id}/features/${item.id}` : null;
  return epic && feature ? `${base}/epics/${epic.id}/features/${feature.id}/pbis/${item.id}` : null;
}
