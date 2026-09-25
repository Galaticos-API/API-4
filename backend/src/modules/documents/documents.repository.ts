import { Pool } from "pg";
import { pool } from "../../database/db.js";
import { auditService } from "../audit/audit.service.js";
import { assertWritable, lockHierarchy } from "../projects/hierarchy-archive.js";
import {
  DOCUMENT_REMOVED_EVENT_TYPE,
  type CreateDocumentInput,
  type DocumentMaintenanceStats,
  type DocumentRecord,
  type DocumentRemovedEvent,
  type RemovalResult,
  type RemoveDocumentInput,
  type StoredDocument,
} from "./documents.types.js";

interface DocumentRow extends Omit<DocumentRecord, "tamanho_bytes"> {
  tamanho_bytes: string | null;
}

export interface PendingEvent {
  chave_idempotencia: string;
  payload: DocumentRemovedEvent;
}

export interface PendingStorageOperation {
  id: string;
  documento_id: string;
  projeto_id: string;
  acao: "finalizar_upload" | "descartar_remocao";
  caminho: string;
}

export interface DocumentPage {
  items: DocumentRecord[];
  hasMore: boolean;
}

const SELECT_COLUMNS = `
  d.id, d.projeto_id, d.nome, d.extensao, d.mime, d.tamanho_bytes, d.status_processamento,
  d.usuario_id AS autor_id, u.nome AS autor_nome,
  EXISTS (
    SELECT 1 FROM documento_operacao_armazenamento op
    WHERE op.documento_id = d.id AND op.acao = 'finalizar_upload' AND op.status = 'pendente'
  ) AS armazenamento_pendente,
  d.created_at::text AS created_at, d.updated_at::text AS updated_at
`;

function toRecord(row: DocumentRow): DocumentRecord {
  return { ...row, tamanho_bytes: row.tamanho_bytes === null ? null : Number(row.tamanho_bytes) };
}

export function removalEventKey(documentId: string): string {
  return `${DOCUMENT_REMOVED_EVENT_TYPE}:${documentId}`;
}

export class DocumentsRepository {
  private readonly pool: Pool;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
  }

  async listByProject(projetoId: string, cursor: { createdAt: string; id: string } | null, limit: number): Promise<DocumentPage> {
    const result = await this.pool.query<DocumentRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM documento d
       LEFT JOIN usuario u ON u.id = d.usuario_id
       WHERE d.projeto_id = $1
         AND ($2::timestamptz IS NULL OR (d.created_at, d.id) < ($2::timestamptz, $3::uuid))
       ORDER BY d.created_at DESC, d.id DESC
       LIMIT $4`,
      [projetoId, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
    );
    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    return { items: rows.map(toRecord), hasMore };
  }

  async findById(projetoId: string, id: string): Promise<StoredDocument | null> {
    const result = await this.pool.query<StoredDocument>(
      `SELECT id, projeto_id, nome, caminho, status_processamento
       FROM documento WHERE id = $1 AND projeto_id = $2`,
      [id, projetoId],
    );
    return result.rows[0] ?? null;
  }

  async create(input: CreateDocumentInput): Promise<DocumentRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await lockHierarchy(client);
      await assertWritable(client, "projeto", input.projetoId);
      await client.query(
        `INSERT INTO documento (id, projeto_id, nome, extensao, mime, tamanho_bytes, caminho, usuario_id, status_processamento)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendente')`,
        [input.id, input.projetoId, input.nome, input.extensao, input.mime, input.tamanhoBytes, input.caminho, input.usuarioId],
      );
      await auditService.record({
        usuario_id: input.usuarioId,
        entidade_tipo: "documento",
        entidade_id: input.id,
        acao: "ENVIAR_DOCUMENTO",
        dados_json: { projeto_id: input.projetoId, nome: input.nome, extensao: input.extensao, tamanho_bytes: input.tamanhoBytes },
      }, client);
      await client.query(
        `INSERT INTO documento_operacao_armazenamento (documento_id, projeto_id, acao, caminho)
         VALUES ($1, $2, 'finalizar_upload', $3)`,
        [input.id, input.projetoId, input.caminho],
      );
      const created = await client.query<DocumentRow>(
        `SELECT ${SELECT_COLUMNS}
         FROM documento d LEFT JOIN usuario u ON u.id = d.usuario_id
         WHERE d.id = $1`,
        [input.id],
      );
      await client.query("COMMIT");
      return toRecord(created.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async remove(input: RemoveDocumentInput): Promise<RemovalResult | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await lockHierarchy(client);
      await assertWritable(client, "projeto", input.projetoId);
      const deleted = await client.query<StoredDocument>(
        `DELETE FROM documento WHERE id = $1 AND projeto_id = $2
         RETURNING id, projeto_id, nome, caminho, status_processamento`,
        [input.id, input.projetoId],
      );
      const documento = deleted.rows[0];
      if (!documento) {
        await client.query("ROLLBACK");
        return null;
      }
      const chunks = await client.query(
        `DELETE FROM chunk WHERE entidade_tipo = 'documento' AND entidade_id = $1 AND projeto_id = $2`,
        [input.id, input.projetoId],
      );
      const chunksRemovidos = chunks.rowCount ?? 0;
      const storageOperation = await client.query<{ id: string }>(
        `INSERT INTO documento_operacao_armazenamento (documento_id, projeto_id, acao, caminho)
         VALUES ($1, $2, 'descartar_remocao', $3) RETURNING id`,
        [input.id, input.projetoId, documento.caminho],
      );
      const indexado = chunksRemovidos > 0 || documento.status_processamento === "processado";
      let eventoChave: string | null = null;
      if (indexado) {
        eventoChave = removalEventKey(input.id);
        const event: DocumentRemovedEvent = {
          event_id: eventoChave,
          event_type: DOCUMENT_REMOVED_EVENT_TYPE,
          schema_version: 1,
          occurred_at: new Date().toISOString(),
          project_id: input.projetoId,
          document_id: input.id,
          chunks_removed: chunksRemovidos,
        };
        await client.query(
          `INSERT INTO evento_integracao (tipo, chave_idempotencia, payload)
           VALUES ($1, $2, $3) ON CONFLICT (chave_idempotencia) DO NOTHING`,
          [DOCUMENT_REMOVED_EVENT_TYPE, eventoChave, JSON.stringify(event)],
        );
      }
      await auditService.record({
        usuario_id: input.usuarioId,
        entidade_tipo: "documento",
        entidade_id: input.id,
        acao: "REMOVER_DOCUMENTO",
        dados_json: { projeto_id: input.projetoId, nome: documento.nome, indexado, chunks_removidos: chunksRemovidos },
      }, client);
      await client.query("COMMIT");
      return { documento, indexado, chunksRemovidos, eventoChave, storageOperationId: storageOperation.rows[0].id };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listPendingEvents(limit: number): Promise<PendingEvent[]> {
    const result = await this.pool.query<PendingEvent>(
      `WITH picked AS (
         SELECT chave_idempotencia FROM evento_integracao
         WHERE status <> 'publicado' AND tipo = $1
           AND next_attempt_at <= CURRENT_TIMESTAMP
           AND (locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP)
         ORDER BY next_attempt_at, created_at
         LIMIT $2 FOR UPDATE SKIP LOCKED
       )
       UPDATE evento_integracao event
       SET locked_until = CURRENT_TIMESTAMP + INTERVAL '1 minute'
       FROM picked
       WHERE event.chave_idempotencia = picked.chave_idempotencia
       RETURNING event.chave_idempotencia, event.payload`,
      [DOCUMENT_REMOVED_EVENT_TYPE, limit],
    );
    return result.rows;
  }

  async markEventPublished(chave: string): Promise<void> {
    await this.pool.query(
      `UPDATE evento_integracao SET status = 'publicado', publicado_em = CURRENT_TIMESTAMP, tentativas = tentativas + 1,
       locked_until = NULL, last_error = NULL
       WHERE chave_idempotencia = $1`,
      [chave],
    );
  }

  async markEventFailed(chave: string): Promise<void> {
    await this.pool.query(
      `UPDATE evento_integracao SET status = 'falha', tentativas = tentativas + 1,
       next_attempt_at = CURRENT_TIMESTAMP + make_interval(secs => LEAST(3600, (15 * power(2, LEAST(tentativas, 8)))::int)),
       locked_until = NULL, last_error = 'Falha ao entregar evento ao consumidor configurado.'
       WHERE chave_idempotencia = $1`,
      [chave],
    );
  }

  async completeStorageOperation(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE documento_operacao_armazenamento SET status = 'concluido', tentativas = tentativas + 1,
       locked_until = NULL, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id],
    );
  }

  async completeUploadOperation(documentId: string): Promise<void> {
    await this.pool.query(
      `UPDATE documento_operacao_armazenamento SET status = 'concluido', tentativas = tentativas + 1,
       locked_until = NULL, last_error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE documento_id = $1 AND acao = 'finalizar_upload' AND status = 'pendente'`,
      [documentId],
    );
  }

  async listPendingStorageOperations(limit: number): Promise<PendingStorageOperation[]> {
    const result = await this.pool.query<PendingStorageOperation>(
      `WITH picked AS (
         SELECT id FROM documento_operacao_armazenamento
         WHERE status = 'pendente' AND next_attempt_at <= CURRENT_TIMESTAMP
           AND (locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP)
         ORDER BY next_attempt_at, created_at
         LIMIT $1 FOR UPDATE SKIP LOCKED
       )
       UPDATE documento_operacao_armazenamento operation
       SET locked_until = CURRENT_TIMESTAMP + INTERVAL '1 minute'
       FROM picked WHERE operation.id = picked.id
       RETURNING operation.id, operation.documento_id, operation.projeto_id, operation.acao, operation.caminho`,
      [limit],
    );
    return result.rows;
  }

  async markStorageOperationFailed(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE documento_operacao_armazenamento SET tentativas = tentativas + 1,
       next_attempt_at = CURRENT_TIMESTAMP + make_interval(secs => LEAST(3600, (15 * power(2, LEAST(tentativas, 8)))::int)),
       locked_until = NULL, last_error = 'Falha ao reconciliar arquivo local.', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'pendente'`,
      [id],
    );
  }

  async markStorageOperationFailedForDocument(documentId: string, action: PendingStorageOperation["acao"]): Promise<void> {
    await this.pool.query(
      `UPDATE documento_operacao_armazenamento SET tentativas = tentativas + 1,
       next_attempt_at = CURRENT_TIMESTAMP + make_interval(secs => LEAST(3600, (15 * power(2, LEAST(tentativas, 8)))::int)),
       locked_until = NULL, last_error = 'Falha ao finalizar o armazenamento local.', updated_at = CURRENT_TIMESTAMP
       WHERE documento_id = $1 AND acao = $2 AND status = 'pendente'`,
      [documentId, action],
    );
  }

  async maintenanceStats(): Promise<DocumentMaintenanceStats> {
    const result = await this.pool.query<DocumentMaintenanceStats>(
      `SELECT
         (SELECT count(*)::int FROM evento_integracao WHERE status <> 'publicado') AS eventos_pendentes,
         (SELECT COALESCE(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - min(created_at)), 0)::int
            FROM evento_integracao WHERE status <> 'publicado') AS evento_mais_antigo_segundos,
         (SELECT count(*)::int FROM documento_operacao_armazenamento WHERE status = 'pendente') AS operacoes_armazenamento_pendentes`,
    );
    return result.rows[0];
  }

  async documentExists(caminho: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>("SELECT EXISTS (SELECT 1 FROM documento WHERE caminho = $1) AS exists", [caminho]);
    return result.rows[0]?.exists ?? false;
  }
}
