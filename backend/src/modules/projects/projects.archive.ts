import { lockHierarchy } from "./hierarchy-archive.js";
import {
  Pool,
  PoolClient,
} from "pg";
import { withTransaction } from "../../database/transaction.js";
import { auditService } from "../audit/audit.service.js";
import {
  ArchiveConflict,
  type ArchiveImpact,
} from "./archive.types.js";
import { ProjectQueries } from "./projects.queries.js";
import {
  Project,
  ProjectWithStats
} from "./projects.types.js";

export class ProjectArchiveRepository {
  constructor(private readonly pool: Pool) { }

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

  async archive(
    id: string,
    usuarioId?: string | null,
    justificativa?: string,
    expected?: ArchiveImpact,
  ): Promise<ProjectWithStats | null> {
    return withTransaction(this.pool, async (client) => {

      await lockHierarchy(client, "projeto", id);

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

        return null;
      }

      if (
        existingProject.status
        === "arquivado"
      ) {

        return existingProject;
      }

      const activeAnalysis = await client.query(
        "SELECT 1 FROM analise_repositorio WHERE projeto_id=$1 AND status NOT IN ('concluido','falha','cancelada') LIMIT 1", [id]);
      if (activeAnalysis.rowCount) throw new ArchiveConflict("Conclua ou cancele a análise de repositório antes de arquivar o projeto.");

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

      return await new ProjectQueries(this.pool).findById(id, client);

    });
  }
}
