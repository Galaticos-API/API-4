import { projectAccessSql } from "../projects/project-access.js";
import { ValidationError } from "../../shared/errors.js";
import { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { withTransaction } from "../../database/transaction.js";
import { buildAuditChangeData } from "../audit/audit.payloads.js";
import { auditService } from "../audit/audit.service.js";
import { assertWritable, lockHierarchy } from "../projects/hierarchy-archive.js";
import { assertJustificationForCompletedItem } from "../quality/completed-item-policy.js";
import { getEntityTechnologyIds, replaceEntityTechnologies } from "../technologies/entity-technologies.js";
import { EPIC_REQUIRED_FIELDS, CreateEpicDTO, Epic, EpicQueryDTO, EpicWithStats, PaginatedEpics, UpdateEpicDTO } from "./epics.types.js";

export class EpicsRepository {
  private pool: Pool;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
  }

  async findById(id: string, executor: Pool | PoolClient = this.pool): Promise<EpicWithStats | null> {
    const query = `
      SELECT
        e.*,
        COALESCE((SELECT array_agg(et.tecnologia_id ORDER BY et.tecnologia_id) FROM entidade_tecnologia et WHERE et.entidade_tipo = 'epico' AND et.entidade_id = e.id), ARRAY[]::uuid[]) AS tecnologias_ids,
        p.status AS projeto_status,
        COALESCE((SELECT COUNT(*)::int FROM feature f WHERE f.epico_id = e.id), 0) AS features_count,
        COALESCE((SELECT COUNT(*)::int FROM criterio_aceitacao c WHERE c.entidade_tipo = 'epico' AND c.entidade_id = e.id), 0) AS criterios_count
      FROM epico e
      JOIN projeto p ON p.id = e.projeto_id
      WHERE e.id = $1
    `;
    const result = await executor.query<EpicWithStats>(query, [id]);
    return result.rows[0] ?? null;
  }

  async create(data: CreateEpicDTO, usuarioId?: string | null): Promise<Epic> {
    return withTransaction(this.pool, async (client) => {

      await lockHierarchy(client, "projeto", data.projeto_id);
      await assertWritable(client, "projeto", data.projeto_id);

      const insertQuery = `
        INSERT INTO epico (projeto_id, titulo, descricao, objetivo, escopo_macro, resultado_esperado, prioridade)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      const values = [
        data.projeto_id,
        data.titulo.trim(),
        data.descricao?.trim() ?? null,
        data.objetivo?.trim() ?? null,
        data.escopo_macro?.trim() ?? null,
        data.resultado_esperado?.trim() ?? null,
        data.prioridade,
      ];

      const result = await client.query<Epic>(insertQuery, values);
      const created = result.rows[0];
      await replaceEntityTechnologies(client, "epico", created.id, data.tecnologias_ids);

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: "epico",
          entidade_id: created.id,
          acao: "CRIAR_EPICO",
          dados_json: { titulo: created.titulo, projeto_id: created.projeto_id, status: created.status, tecnologias_ids: data.tecnologias_ids ?? [] },
        },
        client,
      );

      return created;

    });
  }

  async findAll(query: EpicQueryDTO, userId?: string): Promise<PaginatedEpics> {
    const whereConditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;
    if (userId) {
      whereConditions.push(projectAccessSql("e.projeto_id", "$" + paramIndex++));
      params.push(userId);
    }

    if (query.projeto_id) {
      whereConditions.push(`e.projeto_id = $${paramIndex}`);
      params.push(query.projeto_id);
      paramIndex++;
    }
    if (!query.status) whereConditions.push("e.status != 'arquivado'");
    if (query.status && query.status !== "todos") {
      whereConditions.push(`e.status = $${paramIndex}`);
      params.push(query.status);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const countQuery = `SELECT COUNT(*)::int AS total FROM epico e ${whereClause}`;
    const countResult = await this.pool.query<{ total: number }>(countQuery, params);
    const total = countResult.rows[0]?.total ?? 0;

    const dataParams = [...params, query.limit, query.offset];
    const dataQuery = `
      SELECT
        e.*,
        p.status AS projeto_status,
        COALESCE((SELECT COUNT(*)::int FROM feature f WHERE f.epico_id = e.id), 0) AS features_count,
        COALESCE((SELECT COUNT(*)::int FROM criterio_aceitacao c WHERE c.entidade_tipo = 'epico' AND c.entidade_id = e.id), 0) AS criterios_count
      FROM epico e
      JOIN projeto p ON p.id = e.projeto_id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataResult = await this.pool.query<EpicWithStats>(dataQuery, dataParams);

    return { items: dataResult.rows, total, limit: query.limit, offset: query.offset };
  }

  async update(id: string, data: UpdateEpicDTO, usuarioId?: string | null): Promise<EpicWithStats | null> {
    return withTransaction(this.pool, async (client) => {

      await lockHierarchy(client, "epico", id);
      await assertWritable(client, "epico", id);

      const existing = await this.findById(id, client);
      if (!existing) {

        return null;
      }
      if (existing.status === "concluido") {
        const merged = { ...existing, ...data };
        const missing = EPIC_REQUIRED_FIELDS.filter(field => !String(merged[field] ?? "").trim());
        if (missing.length) throw new ValidationError("Não é possível remover campos obrigatórios de um item concluído.", { campos_faltantes: missing });
      }
      await assertJustificationForCompletedItem(
        client,
        "epico",
        id,
        data.justificativa,
      );

      const updates: string[] = [];
      const values: unknown[] = [];
      let valIndex = 1;

      if (data.titulo !== undefined) { updates.push(`titulo = $${valIndex}`); values.push(data.titulo.trim()); valIndex++; }
      if (data.descricao !== undefined) { updates.push(`descricao = $${valIndex}`); values.push(data.descricao?.trim() ?? null); valIndex++; }
      if (data.objetivo !== undefined) { updates.push(`objetivo = $${valIndex}`); values.push(data.objetivo?.trim() ?? null); valIndex++; }
      if (data.escopo_macro !== undefined) { updates.push(`escopo_macro = $${valIndex}`); values.push(data.escopo_macro?.trim() ?? null); valIndex++; }
      if (data.resultado_esperado !== undefined) { updates.push(`resultado_esperado = $${valIndex}`); values.push(data.resultado_esperado?.trim() ?? null); valIndex++; }
      if (data.prioridade !== undefined) { updates.push(`prioridade = $${valIndex}`); values.push(data.prioridade); valIndex++; }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const result = await client.query<Epic>(
        `UPDATE epico SET ${updates.join(", ")} WHERE id = $${valIndex} RETURNING *`,
        values,
      );
      const updated = result.rows[0];
      await replaceEntityTechnologies(client, "epico", id, data.tecnologias_ids);
      const updatedWithTechnologies = {
        ...updated,
        tecnologias_ids: data.tecnologias_ids === undefined
          ? existing.tecnologias_ids ?? []
          : await getEntityTechnologyIds(client, "epico", id),
      };

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: "epico",
          entidade_id: id,
          acao: "ATUALIZAR_EPICO",
          justificativa: data.justificativa ?? null,
          dados_json: buildAuditChangeData(existing, updatedWithTechnologies, data),
        },
        client,
      );

      const saved = await this.findById(id, client);

      return saved;

    });
  }

  async markConcluded(id: string, usuarioId?: string | null): Promise<EpicWithStats | null> {
    return withTransaction(this.pool, async (client) => {

      await lockHierarchy(client, "epico", id);
      await assertWritable(client, "epico", id);

      const existing = await this.findById(id, client);
      if (!existing) {

        return null;
      }

      if (existing.status === "concluido") return existing;
      const missing: string[] = EPIC_REQUIRED_FIELDS.filter(field => !String(existing[field] ?? "").trim());
      if (!existing.criterios_count) missing.push("criterios_aceitacao");
      if (missing.length) throw new ValidationError("Preencha os campos obrigatórios antes de concluir.", { campos_faltantes: missing });

      await client.query(`UPDATE epico SET status = 'concluido', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: "epico",
          entidade_id: id,
          acao: "CONCLUIR_EPICO",
          dados_json: { status_anterior: existing.status, status_novo: "concluido" },
        },
        client,
      );

      const saved = await this.findById(id, client);

      return saved;

    });
  }
}

export const epicsRepository = new EpicsRepository();
