import { lockHierarchy, assertWritable } from "../projects/hierarchy-archive.js";
import { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { CreateFeatureDTO, UpdateFeatureDTO, FeatureQueryDTO, Feature, FeatureWithStats, PaginatedFeatures } from "./features.types.js";
import { auditService } from "../audit/audit.service.js";
import { assertJustificationForCompletedItem } from "../quality/completed-item-policy.js";
import { buildAuditChangeData } from "../audit/audit.payloads.js";
import { getEntityTechnologyIds, replaceEntityTechnologies } from "../technologies/entity-technologies.js";

const SELECT_WITH_STATS = `
  SELECT
    f.*,
    COALESCE((SELECT array_agg(et.tecnologia_id ORDER BY et.tecnologia_id) FROM entidade_tecnologia et WHERE et.entidade_tipo = 'feature' AND et.entidade_id = f.id), ARRAY[]::uuid[]) AS tecnologias_ids,
    e.titulo AS epico_titulo,
    e.projeto_id AS projeto_id,
    p.status AS projeto_status,
    COALESCE((SELECT COUNT(*)::int FROM pbi p2 WHERE p2.feature_id = f.id), 0) AS pbis_count,
    COALESCE((SELECT COUNT(*)::int FROM criterio_aceitacao c WHERE c.entidade_tipo = 'feature' AND c.entidade_id = f.id), 0) AS criterios_count
  FROM feature f
  JOIN epico e ON e.id = f.epico_id
  JOIN projeto p ON p.id = e.projeto_id
`;

export class FeaturesRepository {
  private pool: Pool;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
  }

  async findById(id: string): Promise<FeatureWithStats | null> {
    const result = await this.pool.query<FeatureWithStats>(`${SELECT_WITH_STATS} WHERE f.id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async create(data: CreateFeatureDTO, usuarioId?: string | null): Promise<Feature> {
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await lockHierarchy(client);
      await assertWritable(client, "epico", data.epico_id);

      const insertQuery = `
        INSERT INTO feature (epico_id, titulo, descricao, objetivo, prioridade)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const values = [
        data.epico_id,
        data.titulo.trim(),
        data.descricao?.trim() ?? null,
        data.objetivo?.trim() ?? null,
        data.prioridade,
      ];

      const result = await client.query<Feature>(insertQuery, values);
      const created = result.rows[0];
      await replaceEntityTechnologies(client, "feature", created.id, data.tecnologias_ids);

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: "feature",
          entidade_id: created.id,
          acao: "CRIAR_FEATURE",
          dados_json: { titulo: created.titulo, epico_id: created.epico_id, status: created.status, tecnologias_ids: data.tecnologias_ids ?? [] },
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

  async findAll(query: FeatureQueryDTO): Promise<PaginatedFeatures> {
    const whereConditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.epico_id) {
      whereConditions.push(`f.epico_id = $${paramIndex}`);
      params.push(query.epico_id);
      paramIndex++;
    }
    if (!query.status) whereConditions.push("f.status != 'arquivado'");
    if (query.status && query.status !== "todos") {
      whereConditions.push(`f.status = $${paramIndex}`);
      params.push(query.status);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const countQuery = `SELECT COUNT(*)::int AS total FROM feature f ${whereClause}`;
    const countResult = await this.pool.query<{ total: number }>(countQuery, params);
    const total = countResult.rows[0]?.total ?? 0;

    const dataParams = [...params, query.limit, query.offset];
    const dataQuery = `
      ${SELECT_WITH_STATS}
      ${whereClause}
      ORDER BY f.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataResult = await this.pool.query<FeatureWithStats>(dataQuery, dataParams);

    return { items: dataResult.rows, total, limit: query.limit, offset: query.offset };
  }

  async update(id: string, data: UpdateFeatureDTO, usuarioId?: string | null): Promise<FeatureWithStats | null> {
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await lockHierarchy(client);
      await assertWritable(client, "feature", id);

      const existing = await this.findById(id);
      if (!existing) {
        await client.query("ROLLBACK");
        return null;
      }
      await assertJustificationForCompletedItem(
        client,
        "feature",
        id,
        data.justificativa,
      );

      const updates: string[] = [];
      const values: unknown[] = [];
      let valIndex = 1;

      if (data.titulo !== undefined) { updates.push(`titulo = $${valIndex}`); values.push(data.titulo.trim()); valIndex++; }
      if (data.descricao !== undefined) { updates.push(`descricao = $${valIndex}`); values.push(data.descricao?.trim() ?? null); valIndex++; }
      if (data.objetivo !== undefined) { updates.push(`objetivo = $${valIndex}`); values.push(data.objetivo?.trim() ?? null); valIndex++; }
      if (data.prioridade !== undefined) { updates.push(`prioridade = $${valIndex}`); values.push(data.prioridade); valIndex++; }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const result = await client.query<Feature>(
        `UPDATE feature SET ${updates.join(", ")} WHERE id = $${valIndex} RETURNING *`,
        values,
      );
      const updated = result.rows[0];
      await replaceEntityTechnologies(client, "feature", id, data.tecnologias_ids);
      const updatedWithTechnologies = {
        ...updated,
        tecnologias_ids: data.tecnologias_ids === undefined
          ? existing.tecnologias_ids ?? []
          : await getEntityTechnologyIds(client, "feature", id),
      };

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: "feature",
          entidade_id: id,
          acao: "ATUALIZAR_FEATURE",
          justificativa: data.justificativa ?? null,
          dados_json: buildAuditChangeData(existing, updatedWithTechnologies, data),
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

  async markConcluded(id: string, usuarioId?: string | null): Promise<FeatureWithStats | null> {
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await lockHierarchy(client);
      await assertWritable(client, "feature", id);

      const existing = await this.findById(id);
      if (!existing) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(`UPDATE feature SET status = 'concluido', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: "feature",
          entidade_id: id,
          acao: "CONCLUIR_FEATURE",
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

export const featuresRepository = new FeaturesRepository();
