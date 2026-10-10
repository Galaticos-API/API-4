export const SEARCH_LEVELS = ["documento", "decisao", "epico", "feature", "pbi"] as const;
export type SearchLevel = typeof SEARCH_LEVELS[number];

export interface HybridSearchInput {
  query: string;
  projectId: string;
  technologyId?: string;
  level?: SearchLevel;
  limit: number;
}

export interface HybridSearchRow {
  id: string;
  project_id: string;
  project_name: string;
  entity_type: SearchLevel;
  entity_id: string;
  title: string | null;
  text: string;
  metadata: Record<string, unknown>;
  source_url: string | null;
  relevance_score: number;
}

export interface HybridSearchResult {
  items: HybridSearchRow[];
  total: number;
  query: string;
  project_id: string;
  filters: { technology_id: string | null; level: SearchLevel | null };
  metrics: { latency_ms: number };
}
