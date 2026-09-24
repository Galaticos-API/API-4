export const DOCUMENT_STATUSES = ["pendente", "processando", "processado", "falha"] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export type DocumentKind = "pdf" | "docx" | "md" | "txt";

export interface DocumentRecord {
  id: string;
  projeto_id: string;
  nome: string;
  extensao: string | null;
  mime: string | null;
  tamanho_bytes: number | null;
  status_processamento: DocumentStatus;
  autor_id: string | null;
  autor_nome: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentLimits {
  max_bytes: number;
  extensoes_permitidas: string[];
}

export interface DocumentList {
  items: DocumentRecord[];
  limites: DocumentLimits;
}

export interface CreateDocumentInput {
  id: string;
  projetoId: string;
  nome: string;
  extensao: string;
  mime: string;
  tamanhoBytes: number;
  caminho: string;
  usuarioId: string;
}

export interface StoredDocument {
  id: string;
  projeto_id: string;
  nome: string;
  caminho: string;
  status_processamento: DocumentStatus;
}

export interface RemovalResult {
  documento: StoredDocument;
  indexado: boolean;
  chunksRemovidos: number;
  eventoChave: string | null;
}

export interface RemoveDocumentInput {
  id: string;
  projetoId: string;
  usuarioId: string;
}

export interface DocumentRemovedEvent {
  event_id: string;
  event_type: "document.removed";
  schema_version: 1;
  occurred_at: string;
  project_id: string;
  document_id: string;
  chunks_removed: number;
}

export const DOCUMENT_REMOVED_EVENT_TYPE = "document.removed";
