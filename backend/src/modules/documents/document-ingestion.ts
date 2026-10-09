import axios from "axios";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import type { ExtractedDocumentChunk, PendingIngestionDocument } from "./documents.types.js";

export interface DocumentIngestionClient {
  process(document: PendingIngestionDocument, content: Buffer): Promise<ExtractedDocumentChunk[]>;
}

export class HttpDocumentIngestionClient implements DocumentIngestionClient {
  constructor(
    private readonly baseUrl = env.AI_SERVICE_URL,
    private readonly token = env.DOCUMENT_INGESTION_TOKEN,
  ) {}

  async process(document: PendingIngestionDocument, content: Buffer): Promise<ExtractedDocumentChunk[]> {
    if (this.token.length < 32) {
      throw new AppError("A autenticação interna da ingestão não está configurada no backend.", 503, "DOCUMENT_INGESTION_UNCONFIGURED");
    }
    try {
      const response = await axios.post(`${this.baseUrl.replace(/\/$/, "")}/documents/process`, {
        document_id: document.id,
        project_id: document.projeto_id,
        filename: document.nome,
        content_base64: content.toString("base64"),
      }, {
        timeout: 600_000,
        maxContentLength: 15 * 1024 * 1024,
        maxBodyLength: 30 * 1024 * 1024,
        headers: { "X-Document-Ingestion-Token": this.token },
      });
      if (response.data?.document_id !== document.id || response.data?.project_id !== document.projeto_id) {
        throw new Error("response scope mismatch");
      }
      const chunks = response.data?.chunks;
      if (!Array.isArray(chunks) || chunks.length === 0 || chunks.length > 500) throw new Error("empty or malformed extraction");
      return chunks.map((chunk: unknown, index: number) => {
        if (typeof chunk !== "object" || chunk === null) throw new Error("malformed chunk");
        const candidate = chunk as Record<string, unknown>;
        const metadata = candidate.metadata as Record<string, unknown> | null;
        if (candidate.chunk_index !== index || typeof candidate.text !== "string" || !candidate.text.trim() || candidate.text.length > 1000
          || !Array.isArray(candidate.embedding) || candidate.embedding.length !== 1024
          || candidate.embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))
          || typeof metadata !== "object" || metadata === null
          || metadata.document_id !== document.id || metadata.project_id !== document.projeto_id
          || metadata.source_name !== document.nome) throw new Error("invalid chunk data");
        return candidate as unknown as ExtractedDocumentChunk;
      });
    } catch (error) {
      if (error instanceof Error && error.message === "empty or malformed extraction") {
        throw new AppError("O serviço local não conseguiu extrair conteúdo indexável do documento.", 422, "DOCUMENT_EXTRACTION_EMPTY");
      }
      if (axios.isAxiosError(error) && error.response) {
        throw new AppError("O serviço local recusou o processamento do documento.", 422, "DOCUMENT_PROCESSING_REJECTED");
      }
      if (axios.isAxiosError(error)) {
        throw new AppError("O serviço local de processamento está indisponível ou excedeu o tempo limite.", 503, "DOCUMENT_PROCESSING_UNAVAILABLE");
      }
      throw new AppError("O serviço local retornou dados de processamento inválidos.", 502, "DOCUMENT_PROCESSING_INVALID");
    }
  }
}
