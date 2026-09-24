import { lockHierarchy, assertWritable } from "../projects/hierarchy-archive.js";
import { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { CreatePbiDTO, UpdatePbiDTO, PbiQueryDTO, Pbi, PbiWithContext, PaginatedPbis } from "./pbis.types.js";
import { auditService } from "../audit/audit.service.js";

const SELECT_WITH_CONTEXT = `
  SELECT
    p.*,
    f.titulo AS feature_titulo,
    e.id AS epico_id,
    e.titulo AS epico_titulo,
    e.projeto_id AS projeto_id,
    pr.status AS projeto_status,
    COALESCE((SELECT COUNT(*)::int FROM criterio_aceitacao c WHERE c.entidade_tipo = 'pbi' AND c.entidade_id = p.id), 0) AS criterios_count,
    EXISTS (SELECT 1 FROM prototipo pt WHERE pt.pbi_id = p.id) AS prototipo_vinculado
  FROM pbi p
  JOIN feature f ON f.id = p.feature_id
  JOIN epico e ON e.id = f.epico_id
  JOIN projeto pr ON pr.id = e.projeto_id
`;

export class PbisRepository {
  private pool: Pool;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
  }

  async findById(id: string): Promise<PbiWithContext | null> {
    const result = await this.pool.query<PbiWithContext>(`${SELECT_WITH_CONTEXT} WHERE p.id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async create(data: CreatePbiDTO, usuarioId?: string | null): Promise<Pbi> {
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await lockHierarchy(client);
      await assertWritable(client, "feature", data.feature_id);

      const seqResult = await client.query<{ proxima_sequencia: number }>(
        `SELECT COUNT(*)::int + 1 AS proxima_sequencia FROM pbi WHERE feature_id = $1`,
        [data.feature_id],
      );
      const sequencia = seqResult.rows[0]?.proxima_sequencia ?? 1;
      const codigo = `PBI-${String(sequencia).padStart(3, "0")}`;

      const insertQuery = `
        INSERT INTO pbi (feature_id, codigo, titulo, historia_como_um, historia_eu_quero, historia_para_que, regras_observacoes, tipo, prioridade, requer_interface)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;
      const values = [
        data.feature_id,
        codigo,
        data.titulo.trim(),
        data.historia_como_um.trim(),
        data.historia_eu_quero.trim(),
        data.historia_para_que.trim(),
        data.regras_observacoes?.trim() ?? null,
        data.tipo,
        data.prioridade,
        data.requer_interface,
      ];

      const result = await client.query<Pbi>(insertQuery, values);
      const created = result.rows[0];

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: "pbi",
          entidade_id: created.id,
          acao: "CRIAR_PBI",
          dados_json: { codigo: created.codigo, titulo: created.titulo, feature_id: created.feature_id, status: created.status, requer_interface: created.requer_interface },
        },
        client,
      );

      await client.query("COMMIT");
      return created;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findAll(query: PbiQueryDTO): Promise<PaginatedPbis> {
    const whereConditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.feature_id) {
      whereConditions.push(`p.feature_id = $${paramIndex}`);
      params.push(query.feature_id);
      paramIndex++;
    }
    if (!query.status) whereConditions.push("p.status != 'arquivado'");
    if (query.status && query.status !== "todos") {
      whereConditions.push(`p.status = $${paramIndex}`);
      params.push(query.status);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const countQuery = `SELECT COUNT(*)::int AS total FROM pbi p ${whereClause}`;
    const countResult = await this.pool.query<{ total: number }>(countQuery, params);
    const total = countResult.rows[0]?.total ?? 0;

    const dataParams = [...params, query.limit, query.offset];
    const dataQuery = `
      ${SELECT_WITH_CONTEXT}
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataResult = await this.pool.query<PbiWithContext>(dataQuery, dataParams);

    return { items: dataResult.rows, total, limit: query.limit, offset: query.offset };
  }

  async update(id: string, data: UpdatePbiDTO, usuarioId?: string | null): Promise<PbiWithContext | null> {
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await lockHierarchy(client);
      await assertWritable(client, "pbi", id);

      const existing = await this.findById(id);
      if (!existing) {
        await client.query("ROLLBACK");
        return null;
      }

      const updates: string[] = [];
      const values: unknown[] = [];
      let valIndex = 1;

      if (data.titulo !== undefined) { updates.push(`titulo = $${valIndex}`); values.push(data.titulo.trim()); valIndex++; }
      if (data.historia_como_um !== undefined) { updates.push(`historia_como_um = $${valIndex}`); values.push(data.historia_como_um.trim()); valIndex++; }
      if (data.historia_eu_quero !== undefined) { updates.push(`historia_eu_quero = $${valIndex}`); values.push(data.historia_eu_quero.trim()); valIndex++; }
      if (data.historia_para_que !== undefined) { updates.push(`historia_para_que = $${valIndex}`); values.push(data.historia_para_que.trim()); valIndex++; }
      if (data.regras_observacoes !== undefined) { updates.push(`regras_observacoes = $${valIndex}`); values.push(data.regras_observacoes?.trim() ?? null); valIndex++; }
      if (data.tipo !== undefined) { updates.push(`tipo = $${valIndex}`); values.push(data.tipo); valIndex++; }
      if (data.prioridade !== undefined) { updates.push(`prioridade = $${valIndex}`); values.push(data.prioridade); valIndex++; }
      if (data.requer_interface !== undefined) { updates.push(`requer_interface = $${valIndex}`); values.push(data.requer_interface); valIndex++; }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const result = await client.query<Pbi>(
        `UPDATE pbi SET ${updates.join(", ")} WHERE id = $${valIndex} RETURNING *`,
        values,
      );
      const updated = result.rows[0];

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: "pbi",
          entidade_id: id,
          acao: "ATUALIZAR_PBI",
          justificativa: data.justificativa ?? null,
          dados_json: { alteracoes: data, anterior: { titulo: existing.titulo }, novo: { titulo: updated.titulo } },
        },
        client,
      );

      await client.query(
        `INSERT INTO pbi_versao (pbi_id, versao, snapshot_json, justificativa, autor_id, created_at)
         VALUES ($1, (SELECT COALESCE(MAX(versao), 0) + 1 FROM pbi_versao WHERE pbi_id = $1), $2, $3, $4, CURRENT_TIMESTAMP)`,
        [id, JSON.stringify(updated), data.justificativa ?? "", usuarioId ?? null],
      );

      await client.query("COMMIT");
      return await this.findById(id);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async markConcluded(id: string, usuarioId?: string | null): Promise<PbiWithContext | null> {
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await lockHierarchy(client);
      await assertWritable(client, "pbi", id);

      const existing = await this.findById(id);
      if (!existing) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(`UPDATE pbi SET status = 'concluido', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: "pbi",
          entidade_id: id,
          acao: "CONCLUIR_PBI",
          dados_json: { status_anterior: existing.status, status_novo: "concluido" },
        },
        client,
      );

      await client.query("COMMIT");
      return await this.findById(id);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

}

export const pbisRepository = new PbisRepository();
