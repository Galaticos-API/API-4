import { Pool } from "pg";
import { pool } from "../../database/db.js";
import { auditService } from "../audit/audit.service.js";
import {
  DOCUMENT_REMOVED_EVENT_TYPE,
  type CreateDocumentInput,
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

const SELECT_COLUMNS = `
  d.id, d.projeto_id, d.nome, d.extensao, d.mime, d.tamanho_bytes, d.status_processamento,
  d.usuario_id AS autor_id, u.nome AS autor_nome, d.created_at, d.updated_at
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

  async listByProject(projetoId: string): Promise<DocumentRecord[]> {
    const result = await this.pool.query<DocumentRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM documento d
       LEFT JOIN usuario u ON u.id = d.usuario_id
       WHERE d.projeto_id = $1
       ORDER BY d.created_at DESC, d.id`,
      [projetoId],
    );
    return result.rows.map(toRecord);
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
      return { documento, indexado, chunksRemovidos, eventoChave };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listPendingEvents(limit: number): Promise<PendingEvent[]> {
    const result = await this.pool.query<PendingEvent>(
      `SELECT chave_idempotencia, payload FROM evento_integracao
       WHERE status <> 'publicado' AND tipo = $1
       ORDER BY created_at LIMIT $2`,
      [DOCUMENT_REMOVED_EVENT_TYPE, limit],
    );
    return result.rows;
  }

  async markEventPublished(chave: string): Promise<void> {
    await this.pool.query(
      `UPDATE evento_integracao SET status = 'publicado', publicado_em = CURRENT_TIMESTAMP, tentativas = tentativas + 1
       WHERE chave_idempotencia = $1`,
      [chave],
    );
  }

  async markEventFailed(chave: string): Promise<void> {
    await this.pool.query(
      `UPDATE evento_integracao SET status = 'falha', tentativas = tentativas + 1
       WHERE chave_idempotencia = $1`,
      [chave],
    );
  }
}
