import { serviceHeaders } from "../../shared/service-auth.js";
import axios from "axios";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { z } from "zod";
import { env } from "../../config/env.js";
import { pool } from "../../database/db.js";
import { withTransaction } from "../../database/transaction.js";
import { ConflictError, NotFoundError } from "../../shared/errors.js";
import { assertWritable, lockHierarchy } from "../projects/hierarchy-archive.js";
import { LocalDocumentStorage } from "./documents.storage.js";

export interface IngestionFailure { code: string; retryable: boolean; httpStatus?: number }
class IngestionScopeError extends Error {}
export function classifyIngestionFailure(error: unknown): IngestionFailure {
  if (error instanceof IngestionScopeError) return {code: "INVALID_SCOPE", retryable: false};
  if (error instanceof z.ZodError) return {code: "INVALID_RESPONSE", retryable: false};
  if (axios.isAxiosError(error)) {
    if (["ECONNABORTED","ETIMEDOUT"].includes(error.code ?? "")) return {code: "TIMEOUT", retryable: true};
    const status = error.response?.status;
    if (status) return {code: status === 422 || status === 400 ? "INVALID_DOCUMENT" : "SERVICE_HTTP_ERROR", retryable: status >= 500 || status === 429, httpStatus: status};
    return {code: "SERVICE_UNAVAILABLE", retryable: true};
  }
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return {code: "FILE_NOT_FOUND", retryable: false};
  return {code: "PROCESSING_ERROR", retryable: true};
}

interface IngestionJob { id: string; projeto_id: string; caminho: string; nome: string; ingest_lease: string }
const chunksSchema = z.array(z.object({ text: z.string().trim().min(1).max(50000), embedding: z.array(z.number().finite()).length(1024).refine(v => v.some(n => n !== 0)) })).min(1).max(5000);
export type IngestedChunk = z.infer<typeof chunksSchema>[number];

export class DocumentIngestionRepository {
  constructor(private readonly db: Pool = pool) { }

  async claim(projectId?: string): Promise<IngestionJob | null> {
    await this.db.query("UPDATE documento SET status_processamento='falha',ingest_lease=NULL,ingest_locked_until=NULL WHERE status_processamento='processando' AND ingest_attempts>=5 AND ingest_locked_until<=CURRENT_TIMESTAMP");
    const result = await this.db.query<IngestionJob>(
      `WITH picked AS (
        SELECT d.id FROM documento d JOIN projeto p ON p.id=d.projeto_id
        WHERE d.status_processamento <> 'processado' AND p.status <> 'arquivado' AND ($2::uuid IS NULL OR d.projeto_id=$2)
          AND d.ingest_retryable AND d.ingest_attempts < 5 AND d.ingest_next_attempt_at <= CURRENT_TIMESTAMP
          AND (d.ingest_locked_until IS NULL OR d.ingest_locked_until <= CURRENT_TIMESTAMP)
          AND NOT EXISTS (SELECT 1 FROM documento_operacao_armazenamento op WHERE op.documento_id=d.id AND op.acao='finalizar_upload' AND op.status='pendente')
        ORDER BY d.ingest_next_attempt_at,d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED
      ) UPDATE documento d SET status_processamento='processando', ingest_lease=$1,
        ingest_locked_until=CURRENT_TIMESTAMP + INTERVAL '3 minutes', ingest_attempts=ingest_attempts+1
      FROM picked WHERE d.id=picked.id RETURNING d.id,d.projeto_id,d.caminho,d.nome,d.ingest_lease`, [randomUUID(), projectId ?? null]);
    return result.rows[0] ?? null;
  }

  async finish(job: IngestionJob, chunks: IngestedChunk[]): Promise<void> {
    const validated = chunksSchema.parse(chunks);
    await withTransaction(this.db, async client => {
      await lockHierarchy(client, "projeto", job.projeto_id);
      await assertWritable(client, "projeto", job.projeto_id);
      const current = await client.query("SELECT id FROM documento WHERE id=$1 AND projeto_id=$2 AND ingest_lease=$3 FOR UPDATE", [job.id, job.projeto_id, job.ingest_lease]);
      // A removed document or superseded lease must never be resurrected.
      if (!current.rowCount) return;
      await client.query("DELETE FROM chunk WHERE projeto_id=$1 AND entidade_tipo='documento' AND entidade_id=$2", [job.projeto_id, job.id]);
      for (const [index, chunk] of validated.entries()) {
        await client.query(`INSERT INTO chunk(id,projeto_id,entidade_tipo,entidade_id,texto,embedding,metadados_json)
          VALUES (md5($1::text || ':' || $2::text)::uuid,$3,'documento',$1::uuid,$4,$5::vector,$6::jsonb)`,
          [job.id, index, job.projeto_id, chunk.text, JSON.stringify(chunk.embedding), JSON.stringify({ document_id: job.id, project_id: job.projeto_id, chunk_index: index, nome: job.nome })]);
      }
      await client.query("UPDATE documento SET status_processamento='processado',ingest_lease=NULL,ingest_locked_until=NULL,ingest_error=NULL,ingest_error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [job.id]);
    });
  }

  async fail(job: IngestionJob, failure: IngestionFailure = { code: "UNKNOWN", retryable: true }): Promise<void> {
    const result = await this.db.query(`UPDATE documento SET status_processamento='falha',ingest_lease=NULL,ingest_locked_until=NULL,
      ingest_error='Não foi possível processar o documento.', ingest_error_code=$3,ingest_retryable=$4, ingest_next_attempt_at=CURRENT_TIMESTAMP + make_interval(secs => LEAST(3600,15 * power(2,ingest_attempts))::int),updated_at=CURRENT_TIMESTAMP
      WHERE id=$1 AND ingest_lease=$2 RETURNING ingest_attempts`, [job.id, job.ingest_lease, failure.code, failure.retryable]);
    if (result.rowCount) console.warn("[Documents] Ingestion failure", { documentId: job.id, projectId: job.projeto_id, attempt: result.rows[0].ingest_attempts, code: failure.code, retryable: failure.retryable, httpStatus: failure.httpStatus });
  }

  async retry(projectId: string, documentId: string): Promise<void> {
    await withTransaction(this.db, async client => {
      await lockHierarchy(client, "projeto", projectId);
      await assertWritable(client, "projeto", projectId);
      const row = (await client.query("SELECT status_processamento,ingest_locked_until FROM documento WHERE id=$1 AND projeto_id=$2 FOR UPDATE", [documentId, projectId])).rows[0];
      if (!row) throw new NotFoundError("Documento não encontrado.");
      if (row.ingest_locked_until && new Date(row.ingest_locked_until).getTime() > Date.now()) throw new ConflictError("Documento em processamento.");
      await client.query("UPDATE documento SET status_processamento='pendente',ingest_attempts=0,ingest_lease=NULL,ingest_locked_until=NULL,ingest_next_attempt_at=CURRENT_TIMESTAMP,ingest_error=NULL,ingest_error_code=NULL,ingest_retryable=TRUE WHERE id=$1", [documentId]);
    });
  }
}

export class DocumentIngestionWorker {
  constructor(
    private readonly repository = new DocumentIngestionRepository(),
    private readonly storage = new LocalDocumentStorage(env.DOCUMENT_STORAGE_DIR),
    private readonly endpoint = env.DOCUMENT_INGEST_WEBHOOK_URL || `${env.AI_SERVICE_URL}/ingest/file`,
  ) { }

  async tick(projectId?: string): Promise<void> {
    const job = await this.repository.claim(projectId);
    if (!job) return;
    try {
      const content = await this.storage.read(job.caminho);
      const { data } = await axios.post(this.endpoint, { document_id: job.id, project_id: job.projeto_id, file_name: job.nome, content_base64: content.toString("base64") }, { headers: serviceHeaders(), timeout: 120000, maxBodyLength: 150 * 1024 * 1024, maxContentLength: 64 * 1024 * 1024 });
      if (data.document_id !== job.id || data.project_id !== job.projeto_id) throw new IngestionScopeError();
      await this.repository.finish(job, chunksSchema.parse(data.chunks));
    } catch (error) { await this.repository.fail(job, classifyIngestionFailure(error)); }
  }
}

export function startDocumentIngestionWorker(worker = new DocumentIngestionWorker()): () => void {
  let running = false;
  const tick = async () => { if (running) return; running = true; try { await worker.tick(); } catch { console.warn("[Documents] Ingestion remains queued for retry."); } finally { running = false; } };
  const timer = setInterval(() => void tick(), 15000);
  timer.unref(); void tick();
  return () => clearInterval(timer);
}
