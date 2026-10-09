import type { PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { AppError, NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";
import { ArchiveConflict } from "../projects/archive.types.js";
import { lockHierarchy } from "../projects/hierarchy-archive.js";
import { auditService } from "../audit/audit.service.js";

export interface IncomingChunk {
  chunk_index: number;
  content: string;
  metadata?: Record<string, unknown>;
  embedding: number[];
}

export interface PersistChunksInput {
  projetoId: string;
  documentoId: string;
  chunks: IncomingChunk[];
}

export interface PersistChunksResult {
  documento_id: string;
  projeto_id: string;
  total_chunks: number;
  status_processamento: "processado";
}

const EXPECTED_DIMENSION = 1024;
const MAX_CHUNKS = 2000;

function assertChunk(chunk: unknown, position: number): asserts chunk is IncomingChunk {
  if (!chunk || typeof chunk !== "object") {
    throw new ValidationError(`Chunk ${position} inválido.`);
  }
  const candidate = chunk as Partial<IncomingChunk>;
  if (typeof candidate.chunk_index !== "number" || !Number.isInteger(candidate.chunk_index) || candidate.chunk_index < 0) {
    throw new ValidationError(`Chunk ${position} com chunk_index inválido.`);
  }
  if (typeof candidate.content !== "string" || candidate.content.trim().length === 0) {
    throw new ValidationError(`Chunk ${position} sem texto.`);
  }
  if (!Array.isArray(candidate.embedding) || candidate.embedding.length !== EXPECTED_DIMENSION) {
    throw new ValidationError(`Chunk ${position} com embedding fora do padrão bge-m3 (${EXPECTED_DIMENSION} dimensões).`);
  }
  for (const value of candidate.embedding) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new ValidationError(`Chunk ${position} tem valor não numérico no embedding.`);
    }
  }
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export class ChunksService {
  async persist(input: PersistChunksInput): Promise<PersistChunksResult> {
    validateUuid(input.projetoId, "ID do projeto");
    validateUuid(input.documentoId, "ID do documento");
    if (!Array.isArray(input.chunks) || input.chunks.length === 0) {
      throw new ValidationError("Envie ao menos um chunk.");
    }
    if (input.chunks.length > MAX_CHUNKS) {
      throw new ValidationError(`Lote excede o limite de ${MAX_CHUNKS} chunks.`);
    }
    input.chunks.forEach(assertChunk);

    const client: PoolClient = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockHierarchy(client);

      const projectRow = await client.query<{ status: string }>(
        "SELECT status FROM projeto WHERE id = $1",
        [input.projetoId],
      );
      if (projectRow.rowCount === 0) {
        throw new NotFoundError("Projeto não encontrado.");
      }
      if (projectRow.rows[0].status === "arquivado") {
        throw new ArchiveConflict("Projeto arquivado é somente leitura e não recebe novos chunks.");
      }

      const document = await client.query<{ id: string; projeto_id: string; status_processamento: string }>(
        "SELECT id, projeto_id, status_processamento FROM documento WHERE id = $1 AND projeto_id = $2 FOR UPDATE",
        [input.documentoId, input.projetoId],
      );
      if (document.rowCount === 0) {
        throw new NotFoundError("Documento não encontrado no projeto informado.");
      }

      // Reindexação idempotente: substitui chunks anteriores do mesmo documento.
      await client.query(
        "DELETE FROM chunk WHERE entidade_tipo = 'documento' AND entidade_id = $1",
        [input.documentoId],
      );

      for (const chunk of input.chunks) {
        await client.query(
          `INSERT INTO chunk (projeto_id, entidade_tipo, entidade_id, texto, metadados_json, embedding)
           VALUES ($1, 'documento', $2, $3, $4::jsonb, $5::vector)`,
          [
            input.projetoId,
            input.documentoId,
            chunk.content,
            JSON.stringify({ ...(chunk.metadata ?? {}), chunk_index: chunk.chunk_index }),
            toVectorLiteral(chunk.embedding),
          ],
        );
      }

      await client.query(
        "UPDATE documento SET status_processamento = 'processado', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [input.documentoId],
      );

      await auditService.record(
        {
          entidade_tipo: "documento",
          entidade_id: input.documentoId,
          acao: "INDEXAR_DOCUMENTO",
          dados_json: {
            projeto_id: input.projetoId,
            total_chunks: input.chunks.length,
            fonte: "n8n_pipeline",
          },
        },
        client,
      );

      await client.query("COMMIT");
      return {
        documento_id: input.documentoId,
        projeto_id: input.projetoId,
        total_chunks: input.chunks.length,
        status_processamento: "processado",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof AppError) throw error;
      throw new AppError("Não foi possível persistir os chunks agora.", 503, "CHUNK_PERSIST_FAILED");
    } finally {
      client.release();
    }
  }
}

export const chunksService = new ChunksService();
