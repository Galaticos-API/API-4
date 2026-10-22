import { apiRequest } from "./api_auth";

export const SEARCH_LEVELS = { documento: "Documento", decisao: "Decisão", epico: "Épico", feature: "Feature", pbi: "PBI", analise_repositorio: "Relatório de repositório" } as const;
export type SearchLevel = keyof typeof SEARCH_LEVELS;
export interface KnowledgeHit {
  id: string; project_id: string; project_name: string; entity_type: SearchLevel; entity_id: string;
  title: string | null; text: string; metadata: Record<string, unknown>; source_url: string | null; relevance_score: number;
}

export async function searchKnowledge(criteria: { query: string; project: string; technology: string; level: string }, signal: AbortSignal): Promise<KnowledgeHit[]> {
  const params = new URLSearchParams({ q: criteria.query.trim(), projeto_id: criteria.project });
  if (criteria.technology) params.set("tecnologia_id", criteria.technology);
  if (criteria.level) params.set("nivel", criteria.level);
  const data: unknown = await (await apiRequest("/search?" + params, { signal })).json();
  if (!data || typeof data !== "object" || !("items" in data) || !Array.isArray(data.items)) throw new Error("Resposta de busca inválida.");
  return data.items.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Resultado de busca inválido.");
    const row = value as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.project_id !== "string" || row.project_id !== criteria.project
      || typeof row.project_name !== "string" || !Object.prototype.hasOwnProperty.call(SEARCH_LEVELS, String(row.entity_type))
      || typeof row.entity_id !== "string" || typeof row.text !== "string"
      || (row.title !== null && typeof row.title !== "string")
      || (row.source_url !== null && typeof row.source_url !== "string")
      || typeof row.relevance_score !== "number" || !Number.isFinite(row.relevance_score)
      || (row.metadata !== null && (typeof row.metadata !== "object" || Array.isArray(row.metadata)))) throw new Error("Resultado de busca inválido ou fora do projeto selecionado.");
    return { ...row, metadata: row.metadata ?? {} } as unknown as KnowledgeHit;
  });
}

export interface DocumentText {
  document: { id: string; name: string; project_id: string };
  items: { id: string; text: string; index: number }[];
  offset: number; total: number; next_offset: number | null;
}

export async function readDocumentText(hit: KnowledgeHit, offset: number | undefined, signal: AbortSignal): Promise<DocumentText> {
  const params = new URLSearchParams({ chunk_id: hit.id });
  if (offset !== undefined) params.set("offset", String(offset));
  const data = await (await apiRequest(`/projects/${encodeURIComponent(hit.project_id)}/documents/${encodeURIComponent(hit.entity_id)}/excerpts?${params}`, { signal })).json();
  if (data?.document?.id !== hit.entity_id || data.document.project_id !== hit.project_id || typeof data.document.name !== "string"
    || !Array.isArray(data.items) || !Number.isInteger(data.offset) || data.offset < 0 || !Number.isInteger(data.total) || data.total <= 0
    || (data.next_offset !== null && (!Number.isInteger(data.next_offset) || data.next_offset <= data.offset))
    || data.items.length === 0 || data.items.length > 20 || data.offset + data.items.length > data.total
    || data.next_offset !== (data.offset + data.items.length < data.total ? data.offset + data.items.length : null)
    || data.items.some((item: { id?: unknown; text?: unknown; index?: unknown } | null, index: number) => !item || typeof item.id !== "string" || typeof item.text !== "string" || item.index !== data.offset + index)) throw new Error("Texto do documento inválido.");
  return data;
}
