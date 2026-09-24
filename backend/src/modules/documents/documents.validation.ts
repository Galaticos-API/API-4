import { AppError, ValidationError } from "../../shared/errors.js";
import type { DocumentKind } from "./documents.types.js";

export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".md", ".txt"] as const;

const KIND_BY_EXTENSION: Record<string, DocumentKind> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".md": "md",
  ".txt": "txt",
};

const MIME_BY_KIND: Record<DocumentKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown",
  txt: "text/plain",
};

const MAX_FILE_NAME_LENGTH = 255;
const PDF_SIGNATURE = Buffer.from("%PDF-", "latin1");
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const DOCX_MAIN_PART = Buffer.from("word/document.xml", "latin1");
const PDF_HEADER_WINDOW = 1024;

export interface InspectedDocument {
  nome: string;
  extensao: string;
  mime: string;
}

export function formatLimit(maxBytes: number): string {
  const megabytes = maxBytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

export function sanitizeFileName(raw: string): string {
  const base = raw.normalize("NFC").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned) throw new ValidationError("Informe o nome do arquivo.");
  if (cleaned.length > MAX_FILE_NAME_LENGTH) {
    throw new ValidationError(`O nome do arquivo não pode exceder ${MAX_FILE_NAME_LENGTH} caracteres.`);
  }
  return cleaned;
}

export function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  if (index <= 0) return "";
  return fileName.slice(index).toLowerCase();
}

function isPdf(content: Buffer): boolean {
  return content.subarray(0, PDF_HEADER_WINDOW).includes(PDF_SIGNATURE);
}

function isDocx(content: Buffer): boolean {
  return content.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE) && content.includes(DOCX_MAIN_PART);
}

function isPlainText(content: Buffer): boolean {
  if (content.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(content);
    return true;
  } catch {
    return false;
  }
}

const CONTENT_CHECKS: Record<DocumentKind, (content: Buffer) => boolean> = {
  pdf: isPdf,
  docx: isDocx,
  md: isPlainText,
  txt: isPlainText,
};

export function inspectDocument(rawName: string, content: Buffer, maxBytes: number): InspectedDocument {
  const nome = sanitizeFileName(rawName);
  const extensao = extensionOf(nome);
  const kind = KIND_BY_EXTENSION[extensao];
  if (!kind) {
    throw new ValidationError("Formato não suportado. Envie arquivos PDF, DOCX, MD ou TXT.");
  }
  if (content.length === 0) throw new ValidationError("O arquivo está vazio.");
  if (content.length > maxBytes) {
    throw new AppError(`O arquivo excede o limite de ${formatLimit(maxBytes)}.`, 413, "PAYLOAD_TOO_LARGE", { max_bytes: maxBytes });
  }
  if (!CONTENT_CHECKS[kind](content)) {
    throw new ValidationError(`O conteúdo do arquivo não corresponde ao formato ${extensao}. Verifique se ele não está corrompido ou foi renomeado.`);
  }
  return { nome, extensao, mime: MIME_BY_KIND[kind] };
}
