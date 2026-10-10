import { projectAccessSql } from "../projects/project-access.js";
import { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { withTransaction } from "../../database/transaction.js";
import { buildAuditChangeData } from "../audit/audit.payloads.js";
import { auditService } from "../audit/audit.service.js";
import { assertWritable, lockHierarchy } from "../projects/hierarchy-archive.js";
import { assertJustificationForCompletedItem, normalizeJustification } from "../quality/completed-item-policy.js";
import { getEntityTechnologyIds, replaceEntityTechnologies } from "../technologies/entity-technologies.js";
import { markFieldsHumanAuthored } from "../provenance/provenance.js";
import { CreatePbiDTO, PaginatedPbis, Pbi, PbiQueryDTO, PbiWithContext, UpdatePbiDTO } from "./pbis.types.js";

const SELECT_WITH_CONTEXT = `
  SELECT
    p.*,
    COALESCE((SELECT array_agg(et.tecnologia_id ORDER BY et.tecnologia_id) FROM entidade_tecnologia et WHERE et.entidade_tipo = 'pbi' AND et.entidade_id = p.id), ARRAY[]::uuid[]) AS tecnologias_ids,
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

  async findById(id: string, executor: Pool | PoolClient = this.pool): Promise<PbiWithContext | null> {
    const result = await executor.query<PbiWithContext>(`${SELECT_WITH_CONTEXT} WHERE p.id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async create(data: CreatePbiDTO, usuarioId?: string | null): Promise<Pbi> {
    return withTransaction(this.pool, async (client) => {

      await lockHierarchy(client, "feature", data.feature_id);
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
      await replaceEntityTechnologies(client, "pbi", created.id, data.tecnologias_ids);

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: "pbi",
          entidade_id: created.id,
          acao: "CRIAR_PBI",
          dados_json: { codigo: created.codigo, titulo: created.titulo, feature_id: created.feature_id, status: created.status, requer_interface: created.requer_interface, tecnologias_ids: data.tecnologias_ids ?? [] },
        },
        client,
      );

      return created;

    });
  }

  async findAll(query: PbiQueryDTO, userId?: string): Promise<PaginatedPbis> {
    const whereConditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;
    if (userId) {
      whereConditions.push(projectAccessSql("(SELECT access_epic.projeto_id FROM feature access_feature JOIN epico access_epic ON access_epic.id=access_feature.epico_id WHERE access_feature.id=p.feature_id)", "$" + paramIndex++));
      params.push(userId);
    }

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
    return withTransaction(this.pool, async (client) => {

      await lockHierarchy(client, "pbi", id);
      await assertWritable(client, "pbi", id);

      const existing = await this.findById(id, client);
      if (!existing) {

        return null;
      }
      await assertJustificationForCompletedItem(
        client,
        "pbi",
        id,
        data.justificativa,
      );

      const updates: string[] = [];
      const values: unknown[] = [];
      const changedFields: string[] = [];
      let valIndex = 1;

      if (data.titulo !== undefined) { updates.push(`titulo = $${valIndex}`); values.push(data.titulo.trim()); valIndex++; changedFields.push("titulo"); }
      if (data.historia_como_um !== undefined) { updates.push(`historia_como_um = $${valIndex}`); values.push(data.historia_como_um.trim()); valIndex++; changedFields.push("historia_como_um"); }
      if (data.historia_eu_quero !== undefined) { updates.push(`historia_eu_quero = $${valIndex}`); values.push(data.historia_eu_quero.trim()); valIndex++; changedFields.push("historia_eu_quero"); }
      if (data.historia_para_que !== undefined) { updates.push(`historia_para_que = $${valIndex}`); values.push(data.historia_para_que.trim()); valIndex++; changedFields.push("historia_para_que"); }
      if (data.regras_observacoes !== undefined) { updates.push(`regras_observacoes = $${valIndex}`); values.push(data.regras_observacoes?.trim() ?? null); valIndex++; changedFields.push("regras_observacoes"); }
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
      // A human submitted this edit through the ordinary update endpoint: any
      // changed free-text field is explicitly human-authored from now on,
      // overriding whatever AI provenance it may have had before (S2-13).
      await markFieldsHumanAuthored(client, "pbi", id, changedFields);
      await replaceEntityTechnologies(client, "pbi", id, data.tecnologias_ids);
      const updatedWithTechnologies = {
        ...updated,
        tecnologias_ids: data.tecnologias_ids === undefined
          ? existing.tecnologias_ids ?? []
          : await getEntityTechnologyIds(client, "pbi", id),
      };

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: "pbi",
          entidade_id: id,
          acao: "ATUALIZAR_PBI",
          justificativa: normalizeJustification(data.justificativa),
          dados_json: buildAuditChangeData(existing, updatedWithTechnologies, data),
        },
        client,
      );

      await client.query(
        `INSERT INTO pbi_versao (pbi_id, versao, snapshot_json, justificativa, autor_id, created_at)
         VALUES ($1, (SELECT COALESCE(MAX(versao), 0) + 1 FROM pbi_versao WHERE pbi_id = $1), $2, $3, $4, CURRENT_TIMESTAMP)`,
        [id, JSON.stringify(updated), normalizeJustification(data.justificativa) ?? "", usuarioId ?? null],
      );

      const saved = await this.findById(id, client);

      return saved;

    });
  }

  async markConcluded(id: string, validate: (client: PoolClient) => Promise<void>, usuarioId?: string | null): Promise<PbiWithContext | null> {
    return withTransaction(this.pool, async (client) => {

      await lockHierarchy(client, "pbi", id);
      await assertWritable(client, "pbi", id);

      const existing = await this.findById(id, client);
      if (!existing) {

        return null;
      }

      if (existing.status === "concluido") {

        return existing;
      }
      await validate(client);

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

      const saved = await this.findById(id, client);

      return saved;

    });
  }

}

export const pbisRepository = new PbisRepository();
