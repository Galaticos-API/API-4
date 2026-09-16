import { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import {
  CreateProjectDTO,
  UpdateProjectDTO,
  ProjectQueryDTO,
  Project,
  ProjectWithStats,
  PaginatedProjects,
} from "./projects.types.js";
import { auditService } from "../audit/audit.service.js";

export class ProjectsRepository {
  private pool: Pool;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
  }

  async findActiveByName(nome: string, excludeId?: string): Promise<Project | null> {
    const params: unknown[] = [nome.trim()];
    let query = `
      SELECT *
      FROM projeto
      WHERE LOWER(TRIM(nome)) = LOWER(TRIM($1))
        AND status != 'arquivado'
    `;

    if (excludeId) {
      params.push(excludeId);
      query += ` AND id != $2`;
    }

    query += ` LIMIT 1`;

    const result = await this.pool.query<Project>(query, params);
    return result.rows[0] ?? null;
  }

  async findById(id: string): Promise<ProjectWithStats | null> {
    const query = `
      SELECT
        p.id,
        p.nome,
        p.cliente,
        p.descricao,
        p.status,
        p.data_inicio,
        p.created_at,
        p.updated_at,
        COALESCE((SELECT COUNT(*)::int FROM epico e WHERE e.projeto_id = p.id), 0) AS epicos_count,
        COALESCE((SELECT COUNT(*)::int FROM documento d WHERE d.projeto_id = p.id), 0) AS documentos_count
      FROM projeto p
      WHERE p.id = $1
    `;

    const result = await this.pool.query<ProjectWithStats>(query, [id]);
    return result.rows[0] ?? null;
  }

  async archiveImpact(id: string): Promise<{ projeto: number; epicos: number; features: number; pbis: number } | null> {
    const result = await this.pool.query<{ projeto: number; epicos: number; features: number; pbis: number }>(`
      SELECT 1 AS projeto,
        (SELECT COUNT(*)::int FROM epico WHERE projeto_id = $1 AND status != 'arquivado') AS epicos,
        (SELECT COUNT(*)::int FROM feature f JOIN epico e ON e.id = f.epico_id WHERE e.projeto_id = $1 AND f.status != 'arquivado') AS features,
        (SELECT COUNT(*)::int FROM pbi p JOIN feature f ON f.id = p.feature_id JOIN epico e ON e.id = f.epico_id WHERE e.projeto_id = $1 AND p.status != 'arquivado') AS pbis
    `, [id]);
    return result.rows[0] ?? null;
  }

  async create(data: CreateProjectDTO, usuarioId?: string | null): Promise<Project> {
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const insertProjectQuery = `
        INSERT INTO projeto (
          nome,
          cliente,
          descricao,
          status,
          data_inicio
        ) VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_TIMESTAMP))
        RETURNING *
      `;

      const projectValues = [
        data.nome.trim(),
        data.cliente.trim(),
        data.descricao?.trim() ?? null,
        data.status ?? "ativo",
        data.data_inicio ?? null,
      ];

      const projectResult = await client.query<Project>(insertProjectQuery, projectValues);
      const createdProject = projectResult.rows[0];

      // Registrar auditoria transacional
      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: "projeto",
          entidade_id: createdProject.id,
          acao: "CRIAR_PROJETO",
          dados_json: {
            nome: createdProject.nome,
            cliente: createdProject.cliente,
            descricao: createdProject.descricao,
            status: createdProject.status,
            data_inicio: createdProject.data_inicio,
          },
        },
        client,
      );

      await client.query("COMMIT");
      return createdProject;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findAll(query: ProjectQueryDTO): Promise<PaginatedProjects> {
    const whereConditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (!query.status || query.status === "ativo") {
      whereConditions.push("p.status != 'arquivado'");
    }

    if (query.status && query.status !== "todos") {
      whereConditions.push(`p.status = $${paramIndex}`);
      params.push(query.status);
      paramIndex++;
    }

    if (query.busca && query.busca.trim().length > 0) {
      whereConditions.push(
        `(p.nome ILIKE $${paramIndex} OR p.cliente ILIKE $${paramIndex} OR p.descricao ILIKE $${paramIndex})`,
      );
      params.push(`%${query.busca.trim()}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    // Total count
    const countQuery = `SELECT COUNT(*)::int AS total FROM projeto p ${whereClause}`;
    const countResult = await this.pool.query<{ total: number }>(countQuery, params);
    const total = countResult.rows[0]?.total ?? 0;

    // Sorting
    let orderByClause = "ORDER BY p.created_at DESC";
    if (query.order === "created_at_asc") {
      orderByClause = "ORDER BY p.created_at ASC";
    } else if (query.order === "nome_asc") {
      orderByClause = "ORDER BY p.nome ASC";
    } else if (query.order === "nome_desc") {
      orderByClause = "ORDER BY p.nome DESC";
    }

    const dataParams = [...params, query.limit, query.offset];
    const dataQuery = `
      SELECT
        p.id,
        p.nome,
        p.cliente,
        p.descricao,
        p.status,
        p.data_inicio,
        p.created_at,
        p.updated_at,
        COALESCE((SELECT COUNT(*)::int FROM epico e WHERE e.projeto_id = p.id), 0) AS epicos_count,
        COALESCE((SELECT COUNT(*)::int FROM documento d WHERE d.projeto_id = p.id), 0) AS documentos_count
      FROM projeto p
      ${whereClause}
      ${orderByClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataResult = await this.pool.query<ProjectWithStats>(dataQuery, dataParams);

    return {
      items: dataResult.rows,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async update(id: string, data: UpdateProjectDTO, usuarioId?: string | null): Promise<ProjectWithStats | null> {
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const existingProject = await this.findById(id);
      if (!existingProject) {
        await client.query("ROLLBACK");
        return null;
      }

      const updates: string[] = [];
      const values: unknown[] = [];
      let valIndex = 1;

      if (data.nome !== undefined) {
        updates.push(`nome = $${valIndex}`);
        values.push(data.nome.trim());
        valIndex++;
      }
      if (data.cliente !== undefined) {
        updates.push(`cliente = $${valIndex}`);
        values.push(data.cliente.trim());
        valIndex++;
      }
      if (data.descricao !== undefined) {
        updates.push(`descricao = $${valIndex}`);
        values.push(data.descricao?.trim() ?? null);
        valIndex++;
      }
      if (data.status !== undefined) {
        updates.push(`status = $${valIndex}`);
        values.push(data.status);
        valIndex++;
      }
      if (data.data_inicio !== undefined) {
        updates.push(`data_inicio = $${valIndex}`);
        values.push(data.data_inicio ?? null);
        valIndex++;
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const updateQuery = `
        UPDATE projeto
        SET ${updates.join(", ")}
        WHERE id = $${valIndex}
        RETURNING *
      `;

      const result = await client.query<Project>(updateQuery, values);
      const updated = result.rows[0];

      // Registrar auditoria
      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: "projeto",
          entidade_id: id,
          acao: "ATUALIZAR_PROJETO",
          justificativa: data.justificativa ?? null,
          dados_json: {
            alteracoes: data,
            anterior: {
              nome: existingProject.nome,
              cliente: existingProject.cliente,
              descricao: existingProject.descricao,
              status: existingProject.status,
            },
            novo: {
              nome: updated.nome,
              cliente: updated.cliente,
              descricao: updated.descricao,
              status: updated.status,
            },
          },
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

  async archive(id: string, usuarioId?: string | null, justificativa?: string): Promise<ProjectWithStats | null> {
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const existingProject = await this.findById(id);
      if (!existingProject) {
        await client.query("ROLLBACK");
        return null;
      }

      const impactResult = await client.query<{ epicos: number; features: number; pbis: number }>(`
        SELECT
          (SELECT COUNT(*)::int FROM epico WHERE projeto_id = $1) AS epicos,
          (SELECT COUNT(*)::int FROM feature f JOIN epico e ON e.id = f.epico_id WHERE e.projeto_id = $1) AS features,
          (SELECT COUNT(*)::int FROM pbi p JOIN feature f ON f.id = p.feature_id JOIN epico e ON e.id = f.epico_id WHERE e.projeto_id = $1) AS pbis
      `, [id]);
      const impact = impactResult.rows[0] ?? { epicos: 0, features: 0, pbis: 0 };

      const updateQuery = `
        UPDATE projeto
        SET status = 'arquivado', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      await client.query(updateQuery, [id]);
      await client.query(`UPDATE epico SET status = 'arquivado', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE projeto_id = $1`, [id]);
      await client.query(`UPDATE feature SET status = 'arquivado', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE epico_id IN (SELECT id FROM epico WHERE projeto_id = $1)`, [id]);
      await client.query(`UPDATE pbi SET status = 'arquivado', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE feature_id IN (SELECT f.id FROM feature f JOIN epico e ON e.id = f.epico_id WHERE e.projeto_id = $1)`, [id]);

      await auditService.record(
        {
          usuario_id: usuarioId ?? null,
          entidade_tipo: "projeto",
          entidade_id: id,
          acao: "ARQUIVAR_PROJETO",
          justificativa: justificativa ?? null,
          dados_json: {
            status_anterior: existingProject.status,
            status_novo: "arquivado",
            impacto: { projeto: 1, ...impact },
          },
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

export const projectsRepository = new ProjectsRepository();
