import { ApiError, apiRequest } from "./api_auth";
import { serverMessage } from "./api_errors";

export const DOCUMENT_STATUSES = ["pendente", "processando", "processado", "falha"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export interface ProjectDocument {
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
  items: ProjectDocument[];
  limites: DocumentLimits;
}

const UPLOAD_TIMEOUT_MS = 120_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseDocument(value: unknown): ProjectDocument {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.projeto_id !== "string"
    || typeof value.nome !== "string"
    || typeof value.created_at !== "string"
    || !(DOCUMENT_STATUSES as readonly string[]).includes(String(value.status_processamento))) {
    throw new Error("Resposta de documento inválida");
  }
  const size = value.tamanho_bytes;
  return {
    id: value.id,
    projeto_id: value.projeto_id,
    nome: value.nome,
    extensao: typeof value.extensao === "string" ? value.extensao : null,
    mime: typeof value.mime === "string" ? value.mime : null,
    tamanho_bytes: typeof size === "number" ? size : null,
    status_processamento: value.status_processamento as DocumentStatus,
    autor_id: typeof value.autor_id === "string" ? value.autor_id : null,
    autor_nome: typeof value.autor_nome === "string" ? value.autor_nome : null,
    created_at: value.created_at,
    updated_at: typeof value.updated_at === "string" ? value.updated_at : value.created_at,
  };
}

function parseLimits(value: unknown): DocumentLimits {
  if (!isRecord(value)
    || typeof value.max_bytes !== "number"
    || !Array.isArray(value.extensoes_permitidas)
    || !value.extensoes_permitidas.every(item => typeof item === "string")) {
    throw new Error("Limites de envio inválidos");
  }
  return { max_bytes: value.max_bytes, extensoes_permitidas: value.extensoes_permitidas as string[] };
}

export async function listDocuments(projectId: string, signal?: AbortSignal): Promise<DocumentList> {
  const response = await apiRequest(`/projects/${encodeURIComponent(projectId)}/documents`, { signal });
  const data: unknown = await response.json();
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error("Lista de documentos inválida");
  return { items: data.items.map(parseDocument), limites: parseLimits(data.limites) };
}

export async function uploadDocument(projectId: string, file: File, signal?: AbortSignal): Promise<ProjectDocument> {
  const response = await apiRequest(`/projects/${encodeURIComponent(projectId)}/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
    signal: signal ?? AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  return parseDocument(await response.json());
}

export async function removeDocument(projectId: string, documentId: string, signal?: AbortSignal): Promise<void> {
  await apiRequest(`/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
    signal,
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function fileExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index).toLowerCase();
}

export function validateSelection(file: File, limits: DocumentLimits): string | null {
  if (!limits.extensoes_permitidas.includes(fileExtension(file.name))) {
    const formats = limits.extensoes_permitidas.map(item => item.slice(1).toUpperCase()).join(", ");
    return `Formato não suportado. Envie arquivos ${formats}.`;
  }
  if (file.size === 0) return "O arquivo está vazio.";
  if (file.size > limits.max_bytes) {
    return `O arquivo tem ${formatBytes(file.size)} e excede o limite de ${formatBytes(limits.max_bytes)}.`;
  }
  return null;
}

export function describeUploadError(error: unknown): string {
  if (error instanceof ApiError) {
    const message = serverMessage(error);
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para enviar o documento.";
    if (error.status === 403) return "Seu perfil não permite enviar documentos neste projeto.";
    if (error.status === 404) return "Projeto não encontrado. Volte à lista de projetos e tente novamente.";
    if ((error.status === 400 || error.status === 413 || error.status === 503) && message) return message;
  }
  return "Não foi possível enviar o arquivo. Sua seleção foi mantida; tente novamente.";
}

export function describeRemovalError(error: unknown): string {
  if (error instanceof ApiError) {
    const message = serverMessage(error);
    if (error.status === 403) return "Seu perfil não permite remover documentos.";
    if (error.status === 404) return "Projeto não encontrado. Atualize a página e tente novamente.";
    if ((error.status === 500 || error.status === 503) && message) return message;
  }
  return "Não foi possível remover o documento. Ele continua disponível; tente novamente.";
}
