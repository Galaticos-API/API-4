import type { Pool } from "pg";
import { pool } from "../../database/db.js";

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
  status_processamento: string;
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

const BASE_SELECT = `
  d.id,
  d.projeto_id,
  p.nome AS projeto_nome,
  d.nome,
  d.extensao,
  d.tamanho_bytes,
  d.status_processamento,
  d.processamento_tentativas,
  d.processamento_erro,
  d.processamento_proxima_tentativa::text AS processamento_proxima_tentativa,
  d.created_at::text AS created_at,
  d.updated_at::text AS updated_at
`;

/**
 * Snapshot do pipeline de ingestao de documentos. Substitui o editor do n8n
 * como ferramenta visual para o PO/admin acompanhar o worker da S2-01.
 */
export class IngestionObservabilityRepository {
  constructor(private readonly db: Pool = pool) {}

  async snapshot(limit = 25): Promise<IngestionSnapshot> {
    const [countsResult, recent, active, failed] = await Promise.all([
      this.db.query<Record<string, string>>(
        `SELECT status_processamento, COUNT(*)::int AS total
           FROM documento
          GROUP BY status_processamento`,
      ),
      this.db.query<IngestionDocument>(
        `SELECT ${BASE_SELECT}
           FROM documento d
           JOIN projeto p ON p.id = d.projeto_id
          ORDER BY d.updated_at DESC
          LIMIT $1`,
        [limit],
      ),
      this.db.query<IngestionDocument>(
        `SELECT ${BASE_SELECT}
           FROM documento d
           JOIN projeto p ON p.id = d.projeto_id
          WHERE d.status_processamento IN ('pendente', 'processando')
          ORDER BY d.processamento_proxima_tentativa NULLS FIRST, d.created_at
          LIMIT $1`,
        [limit],
      ),
      this.db.query<IngestionDocument>(
        `SELECT ${BASE_SELECT}
           FROM documento d
           JOIN projeto p ON p.id = d.projeto_id
          WHERE d.status_processamento = 'falha'
          ORDER BY d.updated_at DESC
          LIMIT $1`,
        [limit],
      ),
    ]);

    const counts: IngestionCounts = { pendente: 0, processando: 0, processado: 0, falha: 0 };
    for (const row of countsResult.rows) {
      const key = row.status_processamento as keyof IngestionCounts;
      if (key in counts) counts[key] = Number(row.total);
    }

    return {
      counts,
      recent: recent.rows,
      active: active.rows,
      failed: failed.rows,
      generated_at: new Date().toISOString(),
    };
  }
}

export const ingestionObservabilityRepository = new IngestionObservabilityRepository();
