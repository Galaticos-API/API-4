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
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isVersionNumber = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647;
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';

function parseVersion(value: unknown): ItemVersion {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || !isVersionNumber(value.versao)
    || !isNullableString(value.autor_id) || !isNullableString(value.autor_nome)
    || typeof value.created_at !== 'string' || !Number.isFinite(Date.parse(value.created_at))
    || typeof value.acao !== 'string' || !isNullableString(value.justificativa)) throw new Error('Versão inválida');
  return {id: value.id, versao: value.versao, autor_id: value.autor_id, autor_nome: value.autor_nome,
    created_at: value.created_at, acao: value.acao, justificativa: value.justificativa};
}

const querySignal = (signal: AbortSignal) => AbortSignal.any([signal, AbortSignal.timeout(15000)]);

export async function listItemVersions(kind: ItemKind, id: string, signal: AbortSignal, before?: number) {
  const query = new URLSearchParams({ limit: '25' });
  if (before) query.set('before', String(before));
  const response = await apiRequest(`/audit/${kind}/${encodeURIComponent(id)}/versions?${query}`, { signal: querySignal(signal) });
  const data: unknown = await response.json();
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error('Lista de versões inválida');
  const next = data.next_before;
  if (next !== null && !isVersionNumber(next)) throw new Error('Paginação de versões inválida');
  return {items: data.items.map(parseVersion), next_before: next} satisfies VersionsPage;
}
export async function compareItemVersions(kind: ItemKind, id: string, from: number, to: number, signal: AbortSignal) {
  const response = await apiRequest(`/audit/${kind}/${encodeURIComponent(id)}/versions/compare?de=${from}&para=${to}`, { signal: querySignal(signal) });
  const data: unknown = await response.json();
  if (!isRecord(data) || !Array.isArray(data.campos)) throw new Error('Comparação inválida');
  const anterior = parseVersion(data.anterior), nova = parseVersion(data.nova);
  if (anterior.versao !== from || nova.versao !== to) throw new Error('Versões diferentes das solicitadas');
  const campos = data.campos.map(change => {
    if (!isRecord(change) || typeof change.campo !== 'string' || !change.campo
      || !Object.prototype.hasOwnProperty.call(change, 'anterior') || !Object.prototype.hasOwnProperty.call(change, 'novo')) throw new Error('Campo de comparação inválido');
    return {campo: change.campo, anterior: change.anterior, novo: change.novo};
  });
  return {anterior, nova, campos} satisfies VersionComparison;
}
