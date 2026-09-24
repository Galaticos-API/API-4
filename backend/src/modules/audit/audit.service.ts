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

export interface AuditHistoryRecord {
  id: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  entidade_tipo: string;
  entidade_id: string;
  acao: string;
  justificativa: string | null;
  dados_json: Record<string, unknown>;
  created_at: string;
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

  async getHistory(entidadeTipo: string, entidadeId: string): Promise<AuditHistoryRecord[]> {
    const query = `
      SELECT
        a.id,
        a.usuario_id,
        u.nome AS usuario_nome,
        a.entidade_tipo,
        a.entidade_id,
        a.acao,
        a.justificativa,
        a.dados_json,
        a.created_at
      FROM auditoria a
      LEFT JOIN usuario u ON u.id = a.usuario_id
      WHERE a.entidade_tipo = $1 AND a.entidade_id = $2
      ORDER BY a.created_at DESC
    `;
    const result = await this.db.query(query, [entidadeTipo, entidadeId]);
    return result.rows.map((row) => ({
      ...row,
      created_at: new Date(row.created_at).toISOString(),
    }));
  }
}

export const auditService = new AuditService();
