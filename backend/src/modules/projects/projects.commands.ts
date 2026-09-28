import {
  Pool
} from "pg";
import { withTransaction } from "../../database/transaction.js";
import { auditService } from "../audit/audit.service.js";
import {
  ArchiveConflict
} from "./archive.types.js";
import { ProjectQueries } from "./projects.queries.js";
import {
  CreateProjectDTO,
  Project,
  ProjectWithStats,
  UpdateProjectDTO
} from "./projects.types.js";

export class ProjectCommands {
  constructor(private readonly pool: Pool) { }

  async create(
    data: CreateProjectDTO,
    usuarioId?: string | null,
  ): Promise<Project> {
    return withTransaction(this.pool, async (client) => {

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

      return createdProject;

    });
  }

  async update(
    id: string,
    data: UpdateProjectDTO,
    usuarioId?: string | null,
  ): Promise<ProjectWithStats | null> {
    return withTransaction(this.pool, async (client) => {

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

      return await new ProjectQueries(this.pool).findById(id, client);

    });
  }
}
