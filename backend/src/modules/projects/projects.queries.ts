import { projectAccessSql } from "../projects/project-access.js";
import {
  Pool,
  PoolClient,
} from "pg";
import {
  PaginatedProjects,
  Project,
  ProjectQueryDTO,
  ProjectWithStats
} from "./projects.types.js";

export class ProjectQueries {
  constructor(private readonly pool: Pool) { }

  async findActiveByName(
    nome: string,
    excludeId?: string,
  ): Promise<Project | null> {
    const params: unknown[] = [
      nome.trim(),
    ];

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

    const result =
      await this.pool.query<Project>(
        query,
        params,
      );

    return result.rows[0] ?? null;
  }

  async findById(
    id: string,
    connection: Pool | PoolClient = this.pool,
  ): Promise<ProjectWithStats | null> {
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
        p.archived_at,
        COALESCE(
          (
            SELECT COUNT(*)::int
            FROM epico e
            WHERE e.projeto_id = p.id
          ),
          0
        ) AS epicos_count,
        COALESCE(
          (
            SELECT COUNT(*)::int
            FROM documento d
            WHERE d.projeto_id = p.id
          ),
          0
        ) AS documentos_count
      FROM projeto p
      WHERE p.id = $1
    `;

    const result =
      await connection
        .query<ProjectWithStats>(
          query,
          [id],
        );

    return result.rows[0] ?? null;
  }

  async findAll(
    query: ProjectQueryDTO,
    userId?: string,
  ): Promise<PaginatedProjects> {
    const whereConditions:
      string[] = [];

    const params: unknown[] = [];

    let paramIndex = 1;
    if (userId) {
      whereConditions.push(projectAccessSql("p.id", "$" + paramIndex++));
      params.push(userId);
    }

    if (!query.status) {
      whereConditions.push(
        "p.status != 'arquivado'",
      );
    }

    if (
      query.status &&
      query.status !== "todos"
    ) {
      whereConditions.push(
        `p.status = $${paramIndex}`,
      );

      params.push(query.status);
      paramIndex++;
    }

    if (
      query.busca &&
      query.busca.trim().length > 0
    ) {
      whereConditions.push(
        `(
          p.nome ILIKE $${paramIndex}
          OR p.cliente ILIKE $${paramIndex}
          OR p.descricao ILIKE $${paramIndex}
        )`,
      );

      params.push(
        `%${query.busca.trim()}%`,
      );

      paramIndex++;
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(
          " AND ",
        )}`
        : "";

    const countQuery = `
      SELECT
        COUNT(*)::int AS total
      FROM projeto p
      ${whereClause}
    `;

    const countResult =
      await this.pool.query<{
        total: number;
      }>(
        countQuery,
        params,
      );

    const total =
      countResult.rows[0]?.total
      ?? 0;

    let orderByClause =
      "ORDER BY p.created_at DESC";

    if (
      query.order
      === "created_at_asc"
    ) {
      orderByClause =
        "ORDER BY p.created_at ASC";
    } else if (
      query.order === "nome_asc"
    ) {
      orderByClause =
        "ORDER BY p.nome ASC";
    } else if (
      query.order === "nome_desc"
    ) {
      orderByClause =
        "ORDER BY p.nome DESC";
    }

    const dataParams = [
      ...params,
      query.limit,
      query.offset,
    ];

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
        p.archived_at,

        COALESCE(
          (
            SELECT COUNT(*)::int
            FROM epico e
            WHERE e.projeto_id = p.id
          ),
          0
        ) AS epicos_count,

        COALESCE(
          (
            SELECT COUNT(*)::int
            FROM documento d
            WHERE d.projeto_id = p.id
          ),
          0
        ) AS documentos_count

      FROM projeto p
      ${whereClause}
      ${orderByClause}
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;

    const dataResult =
      await this.pool
        .query<ProjectWithStats>(
          dataQuery,
          dataParams,
        );

    return {
      items: dataResult.rows,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }
}
