import {
  apiRequest,
  ApiError,
} from "./api_auth";

export type BacklogStatus =
  | "rascunho"
  | "concluido"
  | "arquivado";

export type Priority =
  | "Must"
  | "Should"
  | "Could";

export interface EpicInput {
  projeto_id: string;
  titulo: string;
  descricao: string;
  objetivo: string;
  escopo_macro: string;
  resultado_esperado: string;
  justificativa?: string | null;
}

export interface Epic extends EpicInput {
  id: string;
  prioridade: Priority;
  status: BacklogStatus | "ativo";
  features_count: number;
  criterios_count: number;
  projeto_status: string;
  archived_at: string | null;
}

export interface FeatureInput {
  epico_id: string;
  titulo: string;
  descricao: string;
  objetivo: string;
  justificativa?: string | null;
}

export interface Feature extends FeatureInput {
  id: string;
  prioridade: Priority;
  status: BacklogStatus;
  pbis_count: number;
  criterios_count: number;
  epico_titulo: string;
  projeto_id: string;
  projeto_status: string;
  archived_at: string | null;
}

export interface PbiInput {
  feature_id: string;
  titulo: string;
  historia_como_um: string;
  historia_eu_quero: string;
  historia_para_que: string;
  requer_interface: boolean;
  regras_observacoes?: string | null;
  justificativa?: string | null;
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
  projeto_status: string;
  score_completude: number | null;
  prototipo_vinculado?: boolean;
}

export interface CompletionError {
  campos_faltantes: string[];
}

export function hasCompletudeIndicator(
  score: number | null,
): score is number {
  return score !== null;
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
  rule_version: string;
  checks: QualityCheckResult[];
  score_completude: number | null;
}

export function camposFaltantesDe(
  error: unknown,
): string[] | null {
  if (
    !(error instanceof ApiError) ||
    error.status !== 400
  ) {
    return null;
  }

  const details = error.details as
    | {
        details?: {
          campos_faltantes?: unknown;
        };
      }
    | undefined;

  const campos =
    details?.details?.campos_faltantes;

  return Array.isArray(campos)
    ? campos.filter(
        (campo): campo is string =>
          typeof campo === "string",
      )
    : null;
}

function isNonEmptyId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    /^[a-zA-Z0-9_-]+$/.test(value)
  );
}

function asText(value: unknown): string {
  return typeof value === "string"
    ? value
    : "";
}

function parseEpic(value: unknown): Epic {
  const epic =
    value as Record<string, unknown>;

  if (
    !epic ||
    typeof epic !== "object" ||
    !isNonEmptyId(epic.id) ||
    !isNonEmptyId(epic.projeto_id) ||
    typeof epic.titulo !== "string"
  ) {
    throw new Error(
      "Resposta de épico inválida",
    );
  }

  return {
    id: epic.id,
    projeto_id: epic.projeto_id,
    titulo: epic.titulo,
    descricao: asText(epic.descricao),
    objetivo: asText(epic.objetivo),
    escopo_macro: asText(
      epic.escopo_macro,
    ),
    resultado_esperado: asText(
      epic.resultado_esperado,
    ),
    prioridade:
      (epic.prioridade as Priority) ??
      "Must",
    status:
      (epic.status as Epic["status"]) ??
      "rascunho",
    features_count: Number(
      epic.features_count ?? 0,
    ),
    criterios_count: Number(
      epic.criterios_count ?? 0,
    ),
    projeto_status: asText(
      epic.projeto_status,
    ),
    archived_at:
      typeof epic.archived_at === "string"
        ? epic.archived_at
        : null,
  };
}

function parseFeature(
  value: unknown,
): Feature {
  const feature =
    value as Record<string, unknown>;

  if (
    !feature ||
    typeof feature !== "object" ||
    !isNonEmptyId(feature.id) ||
    !isNonEmptyId(feature.epico_id) ||
    typeof feature.titulo !== "string"
  ) {
    throw new Error(
      "Resposta de feature inválida",
    );
  }

  return {
    id: feature.id,
    epico_id: feature.epico_id,
    titulo: feature.titulo,
    descricao: asText(
      feature.descricao,
    ),
    objetivo: asText(feature.objetivo),
    prioridade:
      (feature.prioridade as Priority) ??
      "Must",
    status:
      (feature.status as BacklogStatus) ??
      "rascunho",
    pbis_count: Number(
      feature.pbis_count ?? 0,
    ),
    criterios_count: Number(
      feature.criterios_count ?? 0,
    ),
    epico_titulo: asText(
      feature.epico_titulo,
    ),
    projeto_id: asText(
      feature.projeto_id,
    ),
    projeto_status: asText(
      feature.projeto_status,
    ),
    archived_at:
      typeof feature.archived_at ===
      "string"
        ? feature.archived_at
        : null,
  };
}

function parsePbi(value: unknown): Pbi {
  const pbi =
    value as Record<string, unknown>;

  if (
    !pbi ||
    typeof pbi !== "object" ||
    !isNonEmptyId(pbi.id) ||
    !isNonEmptyId(pbi.feature_id) ||
    typeof pbi.titulo !== "string"
  ) {
    throw new Error(
      "Resposta de PBI inválida",
    );
  }

  return {
    id: pbi.id,
    feature_id: pbi.feature_id,
    codigo: asText(pbi.codigo),
    titulo: pbi.titulo,
    historia_como_um: asText(
      pbi.historia_como_um,
    ),
    historia_eu_quero: asText(
      pbi.historia_eu_quero,
    ),
    historia_para_que: asText(
      pbi.historia_para_que,
    ),
    requer_interface:
      pbi.requer_interface === true,
    prototipo_vinculado:
      pbi.prototipo_vinculado === true,
    status:
      (pbi.status as BacklogStatus) ??
      "rascunho",
    criterios_count: Number(
      pbi.criterios_count ?? 0,
    ),
    feature_titulo: asText(
      pbi.feature_titulo,
    ),
    epico_id: asText(pbi.epico_id),
    epico_titulo: asText(
      pbi.epico_titulo,
    ),
    projeto_id: asText(pbi.projeto_id),
    score_completude:
      pbi.score_completude === null ||
      pbi.score_completude === undefined
        ? null
        : Number(pbi.score_completude),
    projeto_status: asText(
      pbi.projeto_status,
    ),
  };
}

export async function listEpics(
  projetoId: string,
  signal: AbortSignal,
  status?: string,
): Promise<Epic[]> {
  const params = new URLSearchParams({
    projeto_id: projetoId,
    limit: "100",
  });

  if (status && status !== "todos") {
    params.set("status", status);
  }

  const response = await apiRequest(
    `/epics?${params.toString()}`,
    { signal },
  );

  const data = await response.json();

  if (!Array.isArray(data.items)) {
    throw new Error(
      "Lista de épicos inválida",
    );
  }

  return data.items.map(parseEpic);
}

export async function getEpic(
  id: string,
  signal: AbortSignal,
): Promise<Epic> {
  const response = await apiRequest(
    `/epics/${encodeURIComponent(id)}`,
    { signal },
  );

  return parseEpic(await response.json());
}

export async function createEpic(
  input: EpicInput,
): Promise<Epic> {
  const response = await apiRequest(
    "/epics",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return parseEpic(await response.json());
}

export async function completeEpic(
  id: string,
): Promise<Epic> {
  const response = await apiRequest(
    `/epics/${encodeURIComponent(
      id,
    )}/complete`,
    {
      method: "PATCH",
    },
  );

  return parseEpic(await response.json());
}

export async function updateEpic(
  id: string,
  input: Partial<EpicInput>,
): Promise<Epic> {
  const response = await apiRequest(
    `/epics/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );

  return parseEpic(await response.json());
}

export async function listFeatures(
  epicoId: string,
  signal: AbortSignal,
  status?: string,
): Promise<Feature[]> {
  const params = new URLSearchParams({
    epico_id: epicoId,
    limit: "100",
  });

  if (status && status !== "todos") {
    params.set("status", status);
  }

  const response = await apiRequest(
    `/features?${params.toString()}`,
    { signal },
  );

  const data = await response.json();

  if (!Array.isArray(data.items)) {
    throw new Error(
      "Lista de features inválida",
    );
  }

  return data.items.map(parseFeature);
}

export async function getFeature(
  id: string,
  signal: AbortSignal,
): Promise<Feature> {
  const response = await apiRequest(
    `/features/${encodeURIComponent(id)}`,
    { signal },
  );

  return parseFeature(
    await response.json(),
  );
}

export async function createFeature(
  input: FeatureInput,
): Promise<Feature> {
  const response = await apiRequest(
    "/features",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return parseFeature(
    await response.json(),
  );
}

export async function completeFeature(
  id: string,
): Promise<Feature> {
  const response = await apiRequest(
    `/features/${encodeURIComponent(
      id,
    )}/complete`,
    {
      method: "PATCH",
    },
  );

  return parseFeature(
    await response.json(),
  );
}

export async function updateFeature(
  id: string,
  input: Partial<FeatureInput>,
): Promise<Feature> {
  const response = await apiRequest(
    `/features/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );

  return parseFeature(
    await response.json(),
  );
}

export async function listPbis(
  featureId: string,
  signal: AbortSignal,
): Promise<Pbi[]> {
  const response = await apiRequest(
    `/pbis?feature_id=${encodeURIComponent(
      featureId,
    )}&limit=100`,
    { signal },
  );

  const data = await response.json();

  if (!Array.isArray(data.items)) {
    throw new Error(
      "Lista de PBIs inválida",
    );
  }

  return data.items.map(parsePbi);
}

export async function getPbi(
  id: string,
  signal: AbortSignal,
): Promise<Pbi> {
  const response = await apiRequest(
    `/pbis/${encodeURIComponent(id)}`,
    { signal },
  );

  return parsePbi(await response.json());
}

export async function createPbi(
  input: PbiInput,
): Promise<Pbi> {
  const response = await apiRequest(
    "/pbis",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return parsePbi(await response.json());
}

export async function completePbi(
  id: string,
): Promise<Pbi> {
  const response = await apiRequest(
    `/pbis/${encodeURIComponent(
      id,
    )}/complete`,
    {
      method: "PATCH",
    },
  );

  return parsePbi(await response.json());
}

export async function updatePbi(
  id: string,
  input: Partial<PbiInput>,
): Promise<Pbi> {
  const response = await apiRequest(
    `/pbis/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );

  return parsePbi(await response.json());
}

export interface ValidationResult {
  aprovado: boolean;
  motivo?: string;
}

export interface ScenarioQualityResult {
  id: string;
  nome: string | null;
  aprovado: boolean;
  motivo?: string;
}

export interface VagueTermOccurrence {
  campo: string;
  termos: string[];
}

export interface PbiQualityReport {
  titulo: ValidationResult;
  historia: {
    aprovado: boolean;
    alertas: string[];
  };
  cenarios: ScenarioQualityResult[];
  termos_vagos: VagueTermOccurrence[];
}

export async function getPbiQuality(
  id: string,
  signal: AbortSignal,
): Promise<PbiQualityReport> {
  const response = await apiRequest(
    `/pbis/${encodeURIComponent(
      id,
    )}/quality`,
    { signal },
  );

  return await response.json();
}

export async function getPbiCompleteness(
  id: string,
  signal: AbortSignal,
): Promise<QualityReport> {
  const response = await apiRequest(
    `/quality/pbis/${encodeURIComponent(
      id,
    )}/quality`,
    { signal },
  );

  const data = await response.json();

  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray(data.checks)
  ) {
    throw new Error(
      "Resposta de completude inválida",
    );
  }

  return {
    entity_type: asText(data.entity_type),
    entity_id: asText(data.entity_id),
    rule_version: asText(
      data.rule_version,
    ),
    checks: data.checks.map(
      (check: unknown) => {
        const value =
          check as Record<string, unknown>;

        return {
          check_id: asText(value.check_id),
          check_name: asText(
            value.check_name,
          ),
          passed: value.passed === true,
          message: asText(value.message),
          applicable:
            value.applicable === true,
        };
      },
    ),
    score_completude:
      data.score_completude === null
        ? null
        : Number(data.score_completude),
  };
}

export interface PbiQualityConfigurationRecord {
  rule_version: string;
  checks: Record<
    PbiQualityCheckId,
    boolean
  >;
  vague_terms: string[];
  exigir_justificativa_item_concluido: boolean;
  updated_at?: string;
}

const PBI_QUALITY_CHECK_IDS = [
  "titulo_infinitivo",
  "historia_completa",
  "cenario_estruturado",
  "termos_vagos",
  "prototipo_vinculado",
] as const;

type PbiQualityCheckId =
  (typeof PBI_QUALITY_CHECK_IDS)[number];

export async function getPbiQualityConfiguration(
  signal?: AbortSignal,
): Promise<PbiQualityConfigurationRecord> {
  const response = await apiRequest(
    "/quality/configuration/pbi",
    { signal },
  );

  const data = await response.json();

  const rawChecks = data?.checks as
    | Record<string, unknown>
    | undefined;

  if (
    !data ||
    typeof data !== "object" ||
    typeof data.rule_version !== "string" ||
    !rawChecks ||
    PBI_QUALITY_CHECK_IDS.some(
      (id) =>
        typeof rawChecks[id] !== "boolean",
    ) ||
    !Array.isArray(data.vague_terms) ||
    data.vague_terms.some(
      (term: unknown) =>
        typeof term !== "string",
    ) || (data.exigir_justificativa_item_concluido !== undefined
      && typeof data.exigir_justificativa_item_concluido !== "boolean")
  ) {
    throw new Error(
      "Resposta de configuração de qualidade inválida",
    );
  }

  return {
    rule_version: data.rule_version,
    checks: Object.fromEntries(
      PBI_QUALITY_CHECK_IDS.map((id) => [
        id,
        rawChecks[id],
      ]),
    ) as Record<PbiQualityCheckId, boolean>,
    vague_terms: data.vague_terms,
    exigir_justificativa_item_concluido:
      data.exigir_justificativa_item_concluido ?? true,
    updated_at: asText(data.updated_at),
  };
}

// =======================================
// CRITÉRIOS DE ACEITAÇÃO POLIMÓRFICOS
// =======================================

export type CriterionEntityType =
  | "epico"
  | "feature"
  | "pbi";

export interface Criterion {
  id: string;
  entidade_tipo: CriterionEntityType;
  entidade_id: string;
  texto: string | null;
  nome: string | null;
  dado: string | null;
  quando: string | null;
  entao: string | null;
  ordem: number;
}

export interface TextCriterionInput {
  entidade_tipo: "epico" | "feature";
  entidade_id: string;
  texto: string;
  justificativa?: string;
}

export interface ScenarioCriterionInput {
  entidade_tipo: "pbi";
  entidade_id: string;
  nome: string;
  dado: string;
  quando: string;
  entao: string;
  justificativa?: string;
}

function parseCriterion(
  value: unknown,
): Criterion {
  const criterion =
    value as Record<string, unknown>;

  if (
    !criterion ||
    typeof criterion !== "object" ||
    !isNonEmptyId(criterion.id)
  ) {
    throw new Error(
      "Resposta de critério inválida",
    );
  }

  return {
    id: criterion.id,
    entidade_tipo:
      criterion.entidade_tipo as CriterionEntityType,
    entidade_id: asText(
      criterion.entidade_id,
    ),
    texto:
      typeof criterion.texto === "string"
        ? criterion.texto
        : null,
    nome:
      typeof criterion.nome === "string"
        ? criterion.nome
        : null,
    dado:
      typeof criterion.dado === "string"
        ? criterion.dado
        : null,
    quando:
      typeof criterion.quando === "string"
        ? criterion.quando
        : null,
    entao:
      typeof criterion.entao === "string"
        ? criterion.entao
        : null,
    ordem: Number(criterion.ordem ?? 0),
  };
}

export async function listCriteria(
  entidadeTipo: CriterionEntityType,
  entidadeId: string,
  signal: AbortSignal,
): Promise<Criterion[]> {
  const response = await apiRequest(
    `/criteria?entidade_tipo=${entidadeTipo}&entidade_id=${encodeURIComponent(
      entidadeId,
    )}`,
    { signal },
  );

  const data = await response.json();

  if (!Array.isArray(data.items)) {
    throw new Error(
      "Lista de critérios inválida",
    );
  }

  return data.items.map(parseCriterion);
}

export async function createCriterion(
  input:
    | TextCriterionInput
    | ScenarioCriterionInput,
): Promise<Criterion> {
  const response = await apiRequest(
    "/criteria",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return parseCriterion(
    await response.json(),
  );
}

export async function deleteCriterion(
  id: string,
  justificativa?: string,
): Promise<void> {
  await apiRequest(
    `/criteria/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      ...(justificativa
        ? { body: JSON.stringify({ justificativa }) }
        : {}),
    },
  );
}

export async function moveCriterion(
  id: string,
  direction: "up" | "down",
  justificativa?: string,
): Promise<Criterion[]> {
  const response = await apiRequest(
    `/criteria/${encodeURIComponent(
      id,
    )}/move`,
    {
      method: "PATCH",
      body: JSON.stringify({
        direction,
        ...(justificativa ? { justificativa } : {}),
      }),
    },
  );

  const data = await response.json();

  if (!Array.isArray(data.items)) {
    throw new Error(
      "Lista de critérios inválida",
    );
  }

  return data.items.map(parseCriterion);
}

export interface AuditHistoryItem {
  id: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  entidade_tipo: string;
  entidade_id: string;
  acao: string;
  justificativa: string | null;
  dados_json: Record<string, unknown>;
  created_at: string;
  pbi_versao?: number | null;
  pbi_snapshot?: Record<string, unknown> | null;
}

export interface AuditHistoryPage {
  items: AuditHistoryItem[];
  next_cursor: string | null;
}

export async function getItemHistory(
  entidadeTipo: string,
  entidadeId: string,
  signal?: AbortSignal,
  cursor?: string,
  limit = 25,
): Promise<AuditHistoryPage> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  const response = await apiRequest(
    `/audit/${encodeURIComponent(entidadeTipo)}/${encodeURIComponent(entidadeId)}/history?${query.toString()}`,
    { signal },
  );
  const data = await response.json();
  if (
    !data
    || typeof data !== "object"
    || !Array.isArray(data.items)
    || (data.next_cursor !== undefined
      && data.next_cursor !== null
      && typeof data.next_cursor !== "string")
  ) {
    throw new Error("Resposta do histórico de auditoria inválida");
  }
  return {
    items: data.items,
    next_cursor: data.next_cursor ?? null,
  };
}
