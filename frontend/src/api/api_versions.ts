import { apiRequest } from './api_auth';

export type ItemKind = 'epico' | 'feature' | 'pbi';
export interface ItemVersion {
  id: string; versao: number; autor_id: string | null; autor_nome: string | null;
  created_at: string; acao: string; justificativa: string | null;
}
export interface VersionsPage { items: ItemVersion[]; next_before: number | null }
export interface VersionComparison {
  anterior: ItemVersion; nova: ItemVersion;
  campos: Array<{ campo: string; anterior: unknown; novo: unknown }>;
}
export async function listItemVersions(kind: ItemKind, id: string, signal: AbortSignal, before?: number) {
  const query = new URLSearchParams({ limit: '25' });
  if (before) query.set('before', String(before));
  const response = await apiRequest(`/audit/${kind}/${encodeURIComponent(id)}/versions?${query}`, { signal });
  return await response.json() as VersionsPage;
}
export async function compareItemVersions(kind: ItemKind, id: string, from: number, to: number, signal: AbortSignal) {
  const response = await apiRequest(`/audit/${kind}/${encodeURIComponent(id)}/versions/compare?de=${from}&para=${to}`, { signal });
  return await response.json() as VersionComparison;
}
