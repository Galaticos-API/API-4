export interface SearchFilter {
  query: string;
  userId: string;
  projectId?: string;
}

export interface SearchItem {
  id: string;
  projeto_id: string;
  entidade_tipo: string;
  entidade_id: string;
  texto: string;
  metadados_json: Record<string, unknown> | null;
  created_at: Date | null;
  projeto_nome: string;
}

export interface SearchResult {
  items: SearchItem[];
  total: number | null;
}
