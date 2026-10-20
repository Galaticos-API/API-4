import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { pool } from '../../database/db.js';
import { withTransaction } from '../../database/transaction.js';

/** A completed analysis that is pending embedding indexing. */
export interface PendingReportIndexing {
    id: string;
    projeto_id: string;
    run_id: string;
    repositorio_url: string;
    perfil: string;
    relatorio_markdown: string;
    indexacao_lease_id: string;
    indexacao_tentativas: number;
    metadados?: Record<string, unknown>;
}

/** A single chunk prepared by the AI service, ready for persistence. */
export interface ReportChunk {
    chunk_index: number;
    text: string;
    embedding: number[];
    metadata: Record<string, unknown>;
}

export class ReportIndexingRepository {
    constructor(private readonly db: Pool = pool) {}

    /**
     * Claims one analysis whose report is pending indexing, using lease fencing.
     * Escalates exhausted attempts (>=5) to permanent failure.
     */
    async claimPendingIndexing(): Promise<PendingReportIndexing | null> {
        // Mark exhausted leases as failed.
        await this.db.query(
            `UPDATE analise_repositorio
               SET indexacao_status = 'falha',
                   indexacao_erro = 'Limite de tentativas de indexação atingido.',
                   indexacao_lease_id = NULL,
                   indexacao_bloqueado_ate = NULL,
                   updated_at = NOW()
             WHERE indexacao_status = 'processando'
               AND indexacao_bloqueado_ate <= NOW()
               AND indexacao_tentativas >= 5`,
        );

        const result = await this.db.query<PendingReportIndexing>(
            `UPDATE analise_repositorio
               SET indexacao_status = 'processando',
                   indexacao_tentativas = indexacao_tentativas + 1,
                   indexacao_lease_id = $1,
                   indexacao_bloqueado_ate = NOW() + INTERVAL '5 minutes',
                   updated_at = NOW()
             WHERE id = (
               SELECT id FROM analise_repositorio
                WHERE indexacao_status IN ('pendente', 'processando')
                  AND (indexacao_bloqueado_ate IS NULL OR indexacao_bloqueado_ate <= NOW())
                  AND indexacao_tentativas < 5
                  AND relatorio_markdown IS NOT NULL
                ORDER BY created_at
                FOR UPDATE SKIP LOCKED
                LIMIT 1
             )
             RETURNING id, projeto_id, run_id, repositorio_url, perfil,
                       relatorio_markdown, indexacao_lease_id, indexacao_tentativas, metadados`,
            [randomUUID()],
        );
        return result.rows[0] ?? null;
    }

    /**
     * Persists chunks and marks the analysis as indexed, atomically.
     * Idempotent: deletes any previous chunks for the same analysis before inserting.
     */
    async completeIndexing(
        analysis: PendingReportIndexing,
        chunks: ReportChunk[],
    ): Promise<void> {
        await withTransaction(this.db, async (client) => {
            // Verify lease is still valid.
            const guard = await client.query(
                `SELECT 1 FROM analise_repositorio
                  WHERE id = $1 AND projeto_id = $2
                    AND indexacao_lease_id = $3
                    AND indexacao_status = 'processando'
                    AND indexacao_bloqueado_ate > clock_timestamp()
                  FOR UPDATE`,
                [analysis.id, analysis.projeto_id, analysis.indexacao_lease_id],
            );
            if (!guard.rowCount) return;

            // Idempotent: remove old chunks for this analysis.
            await client.query(
                `DELETE FROM chunk
                  WHERE projeto_id = $1
                    AND entidade_tipo = 'analise_repositorio'
                    AND entidade_id = $2`,
                [analysis.projeto_id, analysis.id],
            );

            // Insert new chunks.
            for (const chunk of chunks) {
                await client.query(
                    `INSERT INTO chunk (id, projeto_id, entidade_tipo, entidade_id, texto, embedding, metadados_json)
                     VALUES ($1, $2, 'analise_repositorio', $3, $4, $5::vector, $6::jsonb)`,
                    [
                        randomUUID(),
                        analysis.projeto_id,
                        analysis.id,
                        chunk.text,
                        JSON.stringify(chunk.embedding),
                        JSON.stringify(chunk.metadata),
                    ],
                );
            }

            // Mark as indexed.
            await client.query(
                `UPDATE analise_repositorio
                   SET indexacao_status = 'indexado',
                       indexacao_lease_id = NULL,
                       indexacao_bloqueado_ate = NULL,
                       indexacao_erro = NULL,
                       updated_at = NOW()
                 WHERE id = $1 AND indexacao_lease_id = $2`,
                [analysis.id, analysis.indexacao_lease_id],
            );
        });
    }

    /**
     * Marks the indexing attempt as failed with exponential backoff.
     */
    async failIndexing(analysis: PendingReportIndexing, error: string): Promise<void> {
        await this.db.query(
            `UPDATE analise_repositorio
               SET indexacao_status = CASE WHEN indexacao_tentativas >= 5 THEN 'falha' ELSE 'pendente' END,
                   indexacao_erro = $3,
                   indexacao_lease_id = NULL,
                   indexacao_bloqueado_ate = NULL,
                   updated_at = NOW()
             WHERE id = $1 AND indexacao_lease_id = $2`,
            [analysis.id, analysis.indexacao_lease_id, error],
        );
    }

    /**
     * Marks a completed analysis as pending indexing.
     * Used when the report markdown is first saved by the sync process.
     */
    async markPendingIndexing(analysisId: string, projectId: string): Promise<void> {
        await this.db.query(
            `UPDATE analise_repositorio
               SET indexacao_status = 'pendente',
                   indexacao_tentativas = 0,
                   indexacao_erro = NULL,
                   indexacao_lease_id = NULL,
                   indexacao_bloqueado_ate = NULL,
                   updated_at = NOW()
             WHERE id = $1 AND projeto_id = $2
               AND relatorio_markdown IS NOT NULL`,
            [analysisId, projectId],
        );
    }
}
