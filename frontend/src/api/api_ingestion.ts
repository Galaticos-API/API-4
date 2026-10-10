import { apiRequest } from "./api_auth";

export type IngestionStatus = "pendente" | "processando" | "processado" | "falha";

export interface IngestionCounts {
  pendente: number;
  processando: number;
  processado: number;
  falha: number;
}

export interface IngestionDocument {
  id: string;
  projeto_id: string;
  projeto_nome: string;
  nome: string;
  extensao: string | null;
  tamanho_bytes: number | null;
  status_processamento: IngestionStatus;
  processamento_tentativas: number;
  processamento_erro: string | null;
  processamento_proxima_tentativa: string | null;
  created_at: string;
  updated_at: string;
}

export interface IngestionSnapshot {
  counts: IngestionCounts;
  recent: IngestionDocument[];
  active: IngestionDocument[];
  failed: IngestionDocument[];
  generated_at: string;
}

const STATUSES: readonly IngestionStatus[] = ["pendente", "processando", "processado", "falha"];

function parseDocument(value: unknown): IngestionDocument | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.nome !== "string" || typeof row.projeto_id !== "string") return null;
  if (!STATUSES.includes(row.status_processamento as IngestionStatus)) return null;
  return {
    id: row.id,
    projeto_id: row.projeto_id,
    projeto_nome: typeof row.projeto_nome === "string" ? row.projeto_nome : "—",
    nome: row.nome,
    extensao: typeof row.extensao === "string" ? row.extensao : null,
    tamanho_bytes: typeof row.tamanho_bytes === "number" ? row.tamanho_bytes : null,
    status_processamento: row.status_processamento as IngestionStatus,
    processamento_tentativas: typeof row.processamento_tentativas === "number" ? row.processamento_tentativas : 0,
    processamento_erro: typeof row.processamento_erro === "string" ? row.processamento_erro : null,
    processamento_proxima_tentativa: typeof row.processamento_proxima_tentativa === "string" ? row.processamento_proxima_tentativa : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

export async function fetchIngestionSnapshot(signal?: AbortSignal): Promise<IngestionSnapshot> {
  const response = await apiRequest("/admin/ingestion?limit=25", { signal });
  const data = await response.json() as Record<string, unknown>;
  const counts = (data.counts ?? {}) as Record<string, number>;
  const parse = (list: unknown): IngestionDocument[] => Array.isArray(list)
    ? list.map(parseDocument).filter((item): item is IngestionDocument => item !== null)
    : [];
  return {
    counts: {
      pendente: Number(counts.pendente ?? 0),
      processando: Number(counts.processando ?? 0),
      processado: Number(counts.processado ?? 0),
      falha: Number(counts.falha ?? 0),
    },
    recent: parse(data.recent),
    active: parse(data.active),
    failed: parse(data.failed),
    generated_at: typeof data.generated_at === "string" ? data.generated_at : new Date().toISOString(),
  };
}

export async function reprocessIngestionDocument(projectId: string, documentId: string): Promise<void> {
  await apiRequest(`/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/retry`, {
    method: "POST",
  });
}
