import {
  Pool
} from "pg";
import { withTransaction } from "../../database/transaction.js";
import {
  BacklogTechnology,
  Project,
  ProjectBacklogTree
} from "./projects.types.js";

export class ProjectBacklogRepository {
  constructor(private readonly pool: Pool) { }

  async findBacklogTree(
    id: string,
  ): Promise<ProjectBacklogTree | null> {
    return withTransaction(this.pool, async (client) => {

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

      return tree;

    }, "snapshot");
  }
}
