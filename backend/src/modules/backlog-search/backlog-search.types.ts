export type BacklogItemType = "epico" | "feature" | "pbi";

export const BACKLOG_SEARCH_STATUSES = ["rascunho", "ativo", "pronto", "concluido", "arquivado"] as const;

export interface SearchPathNode {
  tipo: BacklogItemType;
  id: string;
  titulo: string;
  codigo: string | null;
}

export interface SearchSnippet {
  texto: string;
  destaques: Array<[number, number]>;
}

export interface SearchTechnology {
  id: string;
  nome: string;
}

export interface BacklogSearchItem {
  tipo: BacklogItemType;
  id: string;
  titulo: string;
  codigo: string | null;
  status: string;
  campo: "titulo" | "descricao";
  trecho: SearchSnippet;
  caminho: SearchPathNode[];
  tecnologias: SearchTechnology[];
}

export interface BacklogSearchResponse {
  projeto_id: string;
  termo: string;
  total: number;
  limite: number;
  items: BacklogSearchItem[];
}

export interface BacklogSearchRow {
  tipo: BacklogItemType;
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  codigo: string | null;
  epico_id: string;
  epico_titulo: string;
  feature_id: string | null;
  feature_titulo: string | null;
  tecnologias: SearchTechnology[];
  titulo_match: boolean;
  total: string;
}

export interface BacklogSearchFilters {
  status?: string;
  tecnologiaId?: string;
}

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
