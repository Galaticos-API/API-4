import { apiRequest, ApiError } from "../auth/api";

export type BacklogStatus = "rascunho" | "concluido";
export type Priority = "Must" | "Should" | "Could";

export interface EpicInput {
  projeto_id: string;
  titulo: string;
  descricao: string;
  objetivo: string;
  escopo_macro: string;
  resultado_esperado: string;
}

export interface Epic extends EpicInput {
  id: string;
  prioridade: Priority;
  status: BacklogStatus | "ativo" | "arquivado";
  features_count: number;
  criterios_count: number;
}

export interface FeatureInput {
  epico_id: string;
  titulo: string;
  descricao: string;
  objetivo: string;
}

export interface Feature extends FeatureInput {
  id: string;
  prioridade: Priority;
  status: BacklogStatus;
  pbis_count: number;
  criterios_count: number;
  epico_titulo: string;
  projeto_id: string;
}

export interface PbiInput {
  feature_id: string;
  titulo: string;
  historia_como_um: string;
  historia_eu_quero: string;
  historia_para_que: string;
}

export interface Pbi extends PbiInput {
  id: string;
  codigo: string;
  status: BacklogStatus;
  criterios_count: number;
  feature_titulo: string;
  epico_id: string;
  epico_titulo: string;
  projeto_id: string;
  score_completude: number;
}

export interface CompletionError {
  campos_faltantes: string[];
}

export interface QualityCheckResult {
  check_id: string;
  check_name: string;
  passed: boolean;
  message: string;
  applicable: boolean;
}

export interface QualityReport {
  entity_type: string;
  entity_id: string;
  checks: QualityCheckResult[];
  score_completude: number | null;
}

export function camposFaltantesDe(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const details = error.details as { details?: { campos_faltantes?: unknown } } | undefined;
  const campos = details?.details?.campos_faltantes;
  return Array.isArray(campos) ? campos.filter((campo): campo is string => typeof campo === "string") : null;
}

function isNonEmptyId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseEpic(value: unknown): Epic {
  const epic = value as Record<string, unknown>;
  if (!epic || typeof epic !== "object" || !isNonEmptyId(epic.id) || !isNonEmptyId(epic.projeto_id) || typeof epic.titulo !== "string") {
    throw new Error("Resposta de épico inválida");
  }
  return {
    id: epic.id, projeto_id: epic.projeto_id, titulo: epic.titulo,
    descricao: asText(epic.descricao), objetivo: asText(epic.objetivo),
    escopo_macro: asText(epic.escopo_macro), resultado_esperado: asText(epic.resultado_esperado),
    prioridade: (epic.prioridade as Priority) ?? "Must",
    status: (epic.status as BacklogStatus) ?? "rascunho",
    features_count: Number(epic.features_count ?? 0),
    criterios_count: Number(epic.criterios_count ?? 0),
  };
}

function parseFeature(value: unknown): Feature {
  const feature = value as Record<string, unknown>;
  if (!feature || typeof feature !== "object" || !isNonEmptyId(feature.id) || !isNonEmptyId(feature.epico_id) || typeof feature.titulo !== "string") {
    throw new Error("Resposta de feature inválida");
  }
  return {
    id: feature.id, epico_id: feature.epico_id, titulo: feature.titulo,
    descricao: asText(feature.descricao), objetivo: asText(feature.objetivo),
    prioridade: (feature.prioridade as Priority) ?? "Must",
    status: (feature.status as BacklogStatus) ?? "rascunho",
    pbis_count: Number(feature.pbis_count ?? 0),
    criterios_count: Number(feature.criterios_count ?? 0),
    epico_titulo: asText(feature.epico_titulo),
    projeto_id: asText(feature.projeto_id),
  };
}

function parsePbi(value: unknown): Pbi {
  const pbi = value as Record<string, unknown>;
  if (!pbi || typeof pbi !== "object" || !isNonEmptyId(pbi.id) || !isNonEmptyId(pbi.feature_id) || typeof pbi.titulo !== "string") {
    throw new Error("Resposta de PBI inválida");
  }
  return {
    id: pbi.id, feature_id: pbi.feature_id, codigo: asText(pbi.codigo), titulo: pbi.titulo,
    historia_como_um: asText(pbi.historia_como_um), historia_eu_quero: asText(pbi.historia_eu_quero),
    historia_para_que: asText(pbi.historia_para_que),
    status: (pbi.status as BacklogStatus) ?? "rascunho",
    criterios_count: Number(pbi.criterios_count ?? 0),
    feature_titulo: asText(pbi.feature_titulo), epico_id: asText(pbi.epico_id),
    epico_titulo: asText(pbi.epico_titulo), projeto_id: asText(pbi.projeto_id),
    score_completude: Number(pbi.score_completude ?? 0),
  };
}

export async function listEpics(projetoId: string, signal: AbortSignal): Promise<Epic[]> {
  const data = await (await apiRequest(`/epics?projeto_id=${encodeURIComponent(projetoId)}&limit=100`, { signal })).json();
  if (!Array.isArray(data.items)) throw new Error("Lista de épicos inválida");
  return data.items.map(parseEpic);
}

export async function getEpic(id: string, signal: AbortSignal): Promise<Epic> {
  return parseEpic(await (await apiRequest(`/epics/${encodeURIComponent(id)}`, { signal })).json());
}

export async function createEpic(input: EpicInput): Promise<Epic> {
  return parseEpic(await (await apiRequest("/epics", { method: "POST", body: JSON.stringify(input) })).json());
}

export async function completeEpic(id: string): Promise<Epic> {
  return parseEpic(await (await apiRequest(`/epics/${encodeURIComponent(id)}/complete`, { method: "PATCH" })).json());
}

export async function listFeatures(epicoId: string, signal: AbortSignal): Promise<Feature[]> {
  const data = await (await apiRequest(`/features?epico_id=${encodeURIComponent(epicoId)}&limit=100`, { signal })).json();
  if (!Array.isArray(data.items)) throw new Error("Lista de features inválida");
  return data.items.map(parseFeature);
}

export async function getFeature(id: string, signal: AbortSignal): Promise<Feature> {
  return parseFeature(await (await apiRequest(`/features/${encodeURIComponent(id)}`, { signal })).json());
}

export async function createFeature(input: FeatureInput): Promise<Feature> {
  return parseFeature(await (await apiRequest("/features", { method: "POST", body: JSON.stringify(input) })).json());
}

export async function completeFeature(id: string): Promise<Feature> {
  return parseFeature(await (await apiRequest(`/features/${encodeURIComponent(id)}/complete`, { method: "PATCH" })).json());
}

export async function listPbis(featureId: string, signal: AbortSignal): Promise<Pbi[]> {
  const data = await (await apiRequest(`/pbis?feature_id=${encodeURIComponent(featureId)}&limit=100`, { signal })).json();
  if (!Array.isArray(data.items)) throw new Error("Lista de PBIs inválida");
  return data.items.map(parsePbi);
}

export async function getPbi(id: string, signal: AbortSignal): Promise<Pbi> {
  return parsePbi(await (await apiRequest(`/pbis/${encodeURIComponent(id)}`, { signal })).json());
}

export async function createPbi(input: PbiInput): Promise<Pbi> {
  return parsePbi(await (await apiRequest("/pbis", { method: "POST", body: JSON.stringify(input) })).json());
}

export async function completePbi(id: string): Promise<Pbi> {
  return parsePbi(await (await apiRequest(`/pbis/${encodeURIComponent(id)}/complete`, { method: "PATCH" })).json());
}

export async function getPbiQuality(id: string, signal: AbortSignal): Promise<QualityReport> {
  const data = await (await apiRequest(`/pbis/${encodeURIComponent(id)}/quality`, { signal })).json();
  if (!data || typeof data !== "object") {
    throw new Error("Resposta de qualidade inválida");
  }
  return {
    entity_type: asText(data.entity_type),
    entity_id: asText(data.entity_id),
    checks: Array.isArray(data.checks) ? data.checks.map((check: unknown) => {
      const c = check as Record<string, unknown>;
      return {
        check_id: asText(c.check_id),
        check_name: asText(c.check_name),
        passed: Boolean(c.passed),
        message: asText(c.message),
        applicable: Boolean(c.applicable),
      };
    }) : [],
    score_completude: data.score_completude === null ? null : Number(data.score_completude),
  };
}
