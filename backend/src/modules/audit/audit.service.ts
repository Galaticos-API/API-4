import { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";
import { ENTITY_TYPES, type EntityType } from "../quality/quality.types.js";

const ENTITY_TABLE: Record<EntityType, string> = {
  epico: "epico",
  feature: "feature",
  pbi: "pbi",
};

export interface AuditHistoryCursor {
  created_at: string;
  id: string;
}

export interface AuditHistoryPage {
  items: AuditHistoryRecord[];
  next_cursor: string | null;
}

export function encodeAuditCursor(cursor: AuditHistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeAuditCursor(value: string): AuditHistoryCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 256) {
      throw new Error("Formato inválido");
    }
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== value) {
      throw new Error("Codificação inválida");
    }
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    const createdAt = typeof parsed.created_at === "string"
      ? new Date(parsed.created_at)
      : null;
    if (
      !createdAt
      || Number.isNaN(createdAt.getTime())
      || typeof parsed.id !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)
      || Object.keys(parsed).some((key) => !["created_at", "id"].includes(key))
    ) {
      throw new Error("Cursor inválido");
    }
    return { created_at: createdAt.toISOString(), id: parsed.id };
  } catch {
    throw new ValidationError("Cursor do histórico inválido.");
  }
}

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
  pbi_versao: number | null;
  pbi_snapshot: Record<string, unknown> | null;
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

  async getHistory(
    entidadeTipo: EntityType,
    entidadeId: string,
    limit = 25,
    cursor?: AuditHistoryCursor,
  ): Promise<AuditHistoryPage> {
    if (!ENTITY_TYPES.includes(entidadeTipo)) {
      throw new ValidationError("Tipo de entidade inválido.");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ValidationError("O limite do histórico deve estar entre 1 e 100.");
    }

    const entity = await this.db.query(
      `SELECT 1 FROM ${ENTITY_TABLE[entidadeTipo]} WHERE id = $1`,
      [entidadeId],
    );
    if (!entity.rowCount) throw new NotFoundError("Item não encontrado.");

    const pbiVersionJoin = entidadeTipo === "pbi"
      ? `LEFT JOIN pbi_versao v
          ON v.pbi_id = a.entidade_id
         AND v.created_at = a.created_at
         AND v.autor_id IS NOT DISTINCT FROM a.usuario_id`
      : "";
    const pbiVersionFields = entidadeTipo === "pbi"
      ? `v.versao AS pbi_versao,
         CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_strip_nulls(jsonb_build_object(
           'titulo', v.snapshot_json->'titulo',
           'historia_como_um', v.snapshot_json->'historia_como_um',
           'historia_eu_quero', v.snapshot_json->'historia_eu_quero',
           'historia_para_que', v.snapshot_json->'historia_para_que',
           'regras_observacoes', v.snapshot_json->'regras_observacoes',
           'tipo', v.snapshot_json->'tipo',
           'prioridade', v.snapshot_json->'prioridade',
           'requer_interface', v.snapshot_json->'requer_interface',
           'status', v.snapshot_json->'status'
         )) END AS pbi_snapshot`
      : "NULL::integer AS pbi_versao, NULL::jsonb AS pbi_snapshot";
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
        a.created_at,
        ${pbiVersionFields}
      FROM auditoria a
      LEFT JOIN usuario u ON u.id = a.usuario_id
      ${pbiVersionJoin}
      WHERE a.entidade_tipo = $1 AND a.entidade_id = $2
        AND ($3::timestamptz IS NULL OR (a.created_at, a.id) < ($3::timestamptz, $4::uuid))
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $5
    `;
    const result = await this.db.query(query, [
      entidadeTipo,
      entidadeId,
      cursor?.created_at ?? null,
      cursor?.id ?? null,
      limit + 1,
    ]);
    const hasMore = result.rows.length > limit;
    const items = result.rows.slice(0, limit).map((row) => ({
      ...row,
      created_at: new Date(row.created_at).toISOString(),
      pbi_versao: row.pbi_versao ?? null,
      pbi_snapshot: row.pbi_snapshot ?? null,
    }));
    const lastItem = items.at(-1);

    return {
      items,
      next_cursor: hasMore && lastItem
        ? encodeAuditCursor({ created_at: lastItem.created_at, id: lastItem.id })
        : null,
    };
  }
}

export const auditService = new AuditService();
