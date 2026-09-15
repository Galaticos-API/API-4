import { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";

export interface AuditEntry {
  usuario_id?: string | null;
  entidade_tipo: string;
  entidade_id: string;
  acao: string;
  justificativa?: string | null;
  dados_json: Record<string, unknown>;
}

export class AuditService {
  private db: Pool | PoolClient;

  constructor(dbClient?: Pool | PoolClient) {
    this.db = dbClient ?? pool;
  }

  async record(entry: AuditEntry, client?: PoolClient): Promise<void> {
    const executor = client ?? this.db;
    const query = `
      INSERT INTO auditoria (
        usuario_id,
        entidade_tipo,
        entidade_id,
        acao,
        justificativa,
        dados_json
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    const values = [
      entry.usuario_id ?? null,
      entry.entidade_tipo,
      entry.entidade_id,
      entry.acao,
      entry.justificativa ?? null,
      JSON.stringify(entry.dados_json ?? {}),
    ];

    await executor.query(query, values);
  }
}

export const auditService = new AuditService();
