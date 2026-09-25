import {
  Pool,
  PoolClient,
} from "pg";
import { pool } from "../../database/db.js";
import {
  CreateProjectDTO,
  UpdateProjectDTO,
  ProjectQueryDTO,
  Project,
  ProjectWithStats,
  PaginatedProjects,
  ProjectBacklogTree,
  BacklogTechnology,
} from "./projects.types.js";
import { auditService } from "../audit/audit.service.js";
import {
  ArchiveConflict,
  type ArchiveImpact,
} from "./archive.types.js";

export class ProjectsRepository {
  private pool: Pool;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
  }

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
      await this.pool
        .query<ProjectWithStats>(
          query,
          [id],
        );

    return result.rows[0] ?? null;
  }

  async findBacklogTree(
    id: string,
  ): Promise<ProjectBacklogTree | null> {
    const client = await this.pool.connect();

    try {
      await client.query(
        "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
    const projectResult =
      await client.query<
        Pick<
          Project,
          "id" | "nome" | "status"
        >
      >(
        `
          SELECT
            id,
            nome,
            status
          FROM projeto
          WHERE id = $1
        `,
        [id],
      );

    const project =
      projectResult.rows[0];

    if (!project) {
      await client.query("COMMIT");
      return null;
    }

    type ItemRow = {
      id: string;
      titulo: string;
      status: string;
      tecnologias: BacklogTechnology[];
    };

    type FeatureRow =
      ItemRow & {
        epico_id: string;
      };

    type PbiRow =
      ItemRow & {
        feature_id: string;
        codigo: string;
      };

    const technologyJoin = (
      entityAlias: string,
      entityType: string,
    ) => `
      LEFT JOIN entidade_tecnologia et
        ON et.entidade_id = ${entityAlias}.id
       AND et.entidade_tipo = '${entityType}'
      LEFT JOIN tecnologia t
        ON t.id = et.tecnologia_id
    `;

    const technologyAggregate = `
      COALESCE(
        jsonb_agg(
          DISTINCT jsonb_build_object(
            'id',
            t.id,
            'nome',
            t.nome
          )
        ) FILTER (
          WHERE t.id IS NOT NULL
        ),
        '[]'::jsonb
      ) AS tecnologias
    `;

      const epicsResult = await client.query<ItemRow>(
        `
          SELECT
            e.id,
            e.titulo,
            e.status,
            ${technologyAggregate}
          FROM epico e
          ${technologyJoin(
            "e",
            "epico",
          )}
          WHERE e.projeto_id = $1
          GROUP BY e.id
          ORDER BY
            e.created_at ASC,
            e.id ASC
        `,
        [id],
      );

      const featuresResult = await client.query<FeatureRow>(
        `
          SELECT
            f.id,
            f.epico_id,
            f.titulo,
            f.status,
            ${technologyAggregate}
          FROM feature f
          JOIN epico e
            ON e.id = f.epico_id
          ${technologyJoin(
            "f",
            "feature",
          )}
          WHERE e.projeto_id = $1
          GROUP BY f.id
          ORDER BY
            f.created_at ASC,
            f.id ASC
        `,
        [id],
      );

      const pbisResult = await client.query<PbiRow>(
        `
          SELECT
            p.id,
            p.feature_id,
            p.codigo,
            p.titulo,
            p.status,
            ${technologyAggregate}
          FROM pbi p
          JOIN feature f
            ON f.id = p.feature_id
          JOIN epico e
            ON e.id = f.epico_id
          ${technologyJoin(
            "p",
            "pbi",
          )}
          WHERE e.projeto_id = $1
          GROUP BY p.id
          ORDER BY
            p.created_at ASC,
            p.id ASC
        `,
        [id],
      );

    const pbisByFeature =
      new Map<
        string,
        PbiRow[]
      >();

    for (const pbi of pbisResult.rows) {
      const current =
        pbisByFeature.get(
          pbi.feature_id,
        ) ?? [];

      current.push(pbi);

      pbisByFeature.set(
        pbi.feature_id,
        current,
      );
    }

    const featuresByEpic =
      new Map<
        string,
        Array<
          FeatureRow & {
            pbis: PbiRow[];
          }
        >
      >();

    for (
      const feature
      of featuresResult.rows
    ) {
      const current =
        featuresByEpic.get(
          feature.epico_id,
        ) ?? [];

      current.push({
        ...feature,

        pbis:
          pbisByFeature.get(
            feature.id,
          ) ?? [],
      });

      featuresByEpic.set(
        feature.epico_id,
        current,
      );
    }

    const technologies =
      new Map<
        string,
        BacklogTechnology
      >();

    const collectTechnologies = (
      items: Array<{
        tecnologias:
          BacklogTechnology[];
      }>,
    ) => {
      for (const item of items) {
        for (
          const technology
          of item.tecnologias
        ) {
          technologies.set(
            technology.id,
            technology,
          );
        }
      }
    };

    collectTechnologies(
      epicsResult.rows,
    );

    collectTechnologies(
      featuresResult.rows,
    );

    collectTechnologies(
      pbisResult.rows,
    );

    const tree: ProjectBacklogTree = {
      project,

      epics:
        epicsResult.rows.map(
          (epic) => ({
            id: epic.id,
            titulo: epic.titulo,
            status: epic.status,

            tecnologias:
              epic.tecnologias,

            features: (
              featuresByEpic.get(
                epic.id,
              ) ?? []
            ).map(
              (feature) => ({
                id: feature.id,

                titulo:
                  feature.titulo,

                status:
                  feature.status,

                tecnologias:
                  feature.tecnologias,

                pbis:
                  feature.pbis.map(
                    (pbi) => ({
                      id: pbi.id,

                      codigo:
                        pbi.codigo,

                      titulo:
                        pbi.titulo,

                      status:
                        pbi.status,

                      tecnologias:
                        pbi.tecnologias,
                    }),
                  ),
              }),
            ),
          }),
        ),

      technologies: [
        ...technologies.values(),
      ].sort(
        (a, b) =>
          a.nome.localeCompare(
            b.nome,
            "pt-BR",
          ),
      ),
    };
      await client.query("COMMIT");
      return tree;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async archiveImpact(
    id: string,
    connection:
      | Pool
      | PoolClient = this.pool,
  ): Promise<ArchiveImpact | null> {
    const result =
      await connection
        .query<ArchiveImpact>(
          `
            SELECT
              CASE
                WHEN root.status = 'arquivado'
                  THEN 0
                ELSE 1
              END AS projeto,

              (
                SELECT COUNT(*)::int
                FROM epico
                WHERE projeto_id = $1
                  AND status != 'arquivado'
              ) AS epicos,

              (
                SELECT COUNT(*)::int
                FROM feature f
                JOIN epico e
                  ON e.id = f.epico_id
                WHERE e.projeto_id = $1
                  AND f.status != 'arquivado'
              ) AS features,

              (
                SELECT COUNT(*)::int
                FROM pbi p
                JOIN feature f
                  ON f.id = p.feature_id
                JOIN epico e
                  ON e.id = f.epico_id
                WHERE e.projeto_id = $1
                  AND p.status != 'arquivado'
              ) AS pbis

            FROM projeto root
            WHERE root.id = $1
          `,
          [id],
        );

    return result.rows[0] ?? null;
  }

  async create(
    data: CreateProjectDTO,
    usuarioId?: string | null,
  ): Promise<Project> {
    const client: PoolClient =
      await this.pool.connect();

    try {
      await client.query("BEGIN");

      const insertProjectQuery = `
        INSERT INTO projeto (
          nome,
          cliente,
          descricao,
          status,
          data_inicio
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          COALESCE(
            $5,
            CURRENT_TIMESTAMP
          )
        )
        RETURNING *
      `;

      const projectValues = [
        data.nome.trim(),
        data.cliente.trim(),
        data.descricao?.trim()
          ?? null,
        data.status ?? "ativo",
        data.data_inicio ?? null,
      ];

      const projectResult =
        await client.query<Project>(
          insertProjectQuery,
          projectValues,
        );

      const createdProject =
        projectResult.rows[0];

      await auditService.record(
        {
          usuario_id:
            usuarioId ?? null,

          entidade_tipo:
            "projeto",

          entidade_id:
            createdProject.id,

          acao:
            "CRIAR_PROJETO",

          dados_json: {
            nome:
              createdProject.nome,

            cliente:
              createdProject.cliente,

            descricao:
              createdProject.descricao,

            status:
              createdProject.status,

            data_inicio:
              createdProject.data_inicio,
          },
        },
        client,
      );

      await client.query("COMMIT");

      return createdProject;
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      throw error;
    } finally {
      client.release();
    }
  }

  async findAll(
    query: ProjectQueryDTO,
  ): Promise<PaginatedProjects> {
    const whereConditions:
      string[] = [];

    const params: unknown[] = [];

    let paramIndex = 1;

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

  async update(
    id: string,
    data: UpdateProjectDTO,
    usuarioId?: string | null,
  ): Promise<ProjectWithStats | null> {
    const client: PoolClient =
      await this.pool.connect();

    try {
      await client.query("BEGIN");

      const existingResult =
        await client.query<Project>(
          `
            SELECT *
            FROM projeto
            WHERE id = $1
            FOR UPDATE
          `,
          [id],
        );

      const existingProject =
        existingResult.rows[0];

      if (!existingProject) {
        await client.query(
          "ROLLBACK",
        );

        return null;
      }

      if (
        existingProject.status
        === "arquivado"
      ) {
        throw new ArchiveConflict(
          "Projeto arquivado está disponível apenas para leitura.",
        );
      }

      if (
        String(data.status)
        === "arquivado"
      ) {
        throw new ArchiveConflict(
          "Use a ação de arquivamento com prévia e confirmação.",
        );
      }

      const updates: string[] = [];
      const values: unknown[] = [];

      let valIndex = 1;

      if (
        data.nome !== undefined
      ) {
        updates.push(
          `nome = $${valIndex}`,
        );

        values.push(
          data.nome.trim(),
        );

        valIndex++;
      }

      if (
        data.cliente !== undefined
      ) {
        updates.push(
          `cliente = $${valIndex}`,
        );

        values.push(
          data.cliente.trim(),
        );

        valIndex++;
      }

      if (
        data.descricao
        !== undefined
      ) {
        updates.push(
          `descricao = $${valIndex}`,
        );

        values.push(
          data.descricao?.trim()
            ?? null,
        );

        valIndex++;
      }

      if (
        data.status !== undefined
      ) {
        updates.push(
          `status = $${valIndex}`,
        );

        values.push(data.status);
        valIndex++;
      }

      if (
        data.data_inicio
        !== undefined
      ) {
        updates.push(
          `data_inicio = $${valIndex}`,
        );

        values.push(
          data.data_inicio ?? null,
        );

        valIndex++;
      }

      updates.push(
        "updated_at = CURRENT_TIMESTAMP",
      );

      values.push(id);

      const updateQuery = `
        UPDATE projeto
        SET ${updates.join(", ")}
        WHERE id = $${valIndex}
        RETURNING *
      `;

      const result =
        await client.query<Project>(
          updateQuery,
          values,
        );

      const updated =
        result.rows[0];

      await auditService.record(
        {
          usuario_id:
            usuarioId ?? null,

          entidade_tipo:
            "projeto",

          entidade_id: id,

          acao:
            "ATUALIZAR_PROJETO",

          justificativa:
            data.justificativa
            ?? null,

          dados_json: {
            alteracoes: data,

            anterior: {
              nome:
                existingProject.nome,

              cliente:
                existingProject.cliente,

              descricao:
                existingProject.descricao,

              status:
                existingProject.status,
            },

            novo: {
              nome:
                updated.nome,

              cliente:
                updated.cliente,

              descricao:
                updated.descricao,

              status:
                updated.status,
            },
          },
        },
        client,
      );

      await client.query("COMMIT");

      return await this.findById(id);
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      throw error;
    } finally {
      client.release();
    }
  }

  async archive(
    id: string,
    usuarioId?: string | null,
    justificativa?: string,
    expected?: ArchiveImpact,
  ): Promise<ProjectWithStats | null> {
    const client: PoolClient =
      await this.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
          LOCK TABLE
            projeto,
            epico,
            feature,
            pbi
          IN SHARE ROW EXCLUSIVE MODE
        `,
      );

      const existingResult =
        await client.query<Project>(
          `
            SELECT *
            FROM projeto
            WHERE id = $1
            FOR UPDATE
          `,
          [id],
        );

      const existingProject =
        existingResult.rows[0];

      if (!existingProject) {
        await client.query(
          "ROLLBACK",
        );

        return null;
      }

      if (
        existingProject.status
        === "arquivado"
      ) {
        await client.query(
          "COMMIT",
        );

        return existingProject;
      }

      const impact = (
        await this.archiveImpact(
          id,
          client,
        )
      )!;

      if (
        expected &&
        (
          Object.keys(
            impact,
          ) as (
            keyof ArchiveImpact
          )[]
        ).some(
          (key) =>
            impact[key]
            !== expected[key],
        )
      ) {
        throw new ArchiveConflict(
          "A quantidade de itens mudou. Consulte a prévia e confirme novamente.",
        );
      }

      const updateQuery = `
        UPDATE projeto
        SET
          status = 'arquivado',
          archived_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      await client.query(
        updateQuery,
        [id],
      );

      await client.query(
        `
          UPDATE epico
          SET
            status = 'arquivado',
            archived_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE projeto_id = $1
            AND status != 'arquivado'
        `,
        [id],
      );

      await client.query(
        `
          UPDATE feature
          SET
            status = 'arquivado',
            archived_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE epico_id IN (
            SELECT id
            FROM epico
            WHERE projeto_id = $1
          )
            AND status != 'arquivado'
        `,
        [id],
      );

      await client.query(
        `
          UPDATE pbi
          SET
            status = 'arquivado',
            archived_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE feature_id IN (
            SELECT f.id
            FROM feature f
            JOIN epico e
              ON e.id = f.epico_id
            WHERE e.projeto_id = $1
          )
            AND status != 'arquivado'
        `,
        [id],
      );

      await auditService.record(
        {
          usuario_id:
            usuarioId ?? null,

          entidade_tipo:
            "projeto",

          entidade_id: id,

          acao:
            "ARQUIVAR_PROJETO",

          justificativa:
            justificativa ?? null,

          dados_json: {
            status_anterior:
              existingProject.status,

            status_novo:
              "arquivado",

            impacto: impact,
          },
        },
        client,
      );

      await client.query("COMMIT");

      return await this.findById(id);
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      throw error;
    } finally {
      client.release();
    }
  }
}

export const projectsRepository =
  new ProjectsRepository();
