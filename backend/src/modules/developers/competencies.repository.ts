import type { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { withTransaction } from "../../database/transaction.js";
import { AppError, NotFoundError } from "../../shared/errors.js";
import { auditService } from "../audit/audit.service.js";
import type { Competency } from "./developers.types.js";

export const COMPETENCY_LEVELS = ["iniciante", "intermediario", "avancado", "especialista"] as const;
export type CompetencyLevel = (typeof COMPETENCY_LEVELS)[number];

export interface CompetencyInput {
  tecnologia_id: string;
  nivel: CompetencyLevel;
  evidencia: string;
}

export interface CompetencyUpdate {
  nivel?: CompetencyLevel;
  evidencia?: string;
}

/** Tecnologia informada não está no vocabulário: a tela oferece incluí-la (PBI-05.1.2, cenário 3). */
export class TechnologyNotInVocabularyError extends AppError {
  constructor() {
    super(
      "A tecnologia informada não existe no vocabulário controlado. Inclua-a no vocabulário antes de registrar a competência.",
      422,
      "TECHNOLOGY_NOT_IN_VOCABULARY",
      { oferecer_inclusao: true },
    );
    this.name = "TechnologyNotInVocabularyError";
  }
}

export class CompetencyExistsError extends AppError {
  constructor(existing: Competency) {
    super(
      `O perfil já possui a competência em ${existing.tecnologia_nome}. Edite o registro existente.`,
      409,
      "COMPETENCY_EXISTS",
      { existente: existing },
    );
    this.name = "CompetencyExistsError";
  }
}

const SELECT_COMPETENCY = `
  SELECT c.id, c.desenvolvedor_id, c.tecnologia_id, c.nivel, c.evidencia,
         t.nome AS tecnologia_nome, t.categoria AS tecnologia_categoria
  FROM competencia c
  JOIN tecnologia t ON t.id = c.tecnologia_id
`;

async function lockDeveloper(client: PoolClient, developerId: string): Promise<void> {
  const { rowCount } = await client.query("SELECT 1 FROM desenvolvedor WHERE id = $1 FOR UPDATE", [developerId]);
  if (!rowCount) throw new NotFoundError("Perfil profissional não encontrado.");
}

async function findCompetency(client: PoolClient, developerId: string, competencyId: string): Promise<Competency> {
  const { rows } = await client.query<Competency>(
    `${SELECT_COMPETENCY} WHERE c.id = $1 AND c.desenvolvedor_id = $2`,
    [competencyId, developerId],
  );
  if (!rows[0]) throw new NotFoundError("Competência não encontrada neste perfil.");
  return rows[0];
}

export class CompetenciesRepository {
  constructor(private readonly db: Pick<Pool, "query" | "connect"> = pool) {}

  async create(developerId: string, input: CompetencyInput, actorUserId: string): Promise<Competency> {
    return withTransaction(this.db as Pool, async (client) => {
      await lockDeveloper(client, developerId);
      // FOR SHARE impede que a tecnologia seja removida do vocabulário durante o registro.
      const technology = await client.query("SELECT 1 FROM tecnologia WHERE id = $1 FOR SHARE", [input.tecnologia_id]);
      if (!technology.rowCount) throw new TechnologyNotInVocabularyError();

      const duplicate = await client.query<Competency>(
        `${SELECT_COMPETENCY} WHERE c.desenvolvedor_id = $1 AND c.tecnologia_id = $2`,
        [developerId, input.tecnologia_id],
      );
      if (duplicate.rows[0]) throw new CompetencyExistsError(duplicate.rows[0]);

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO competencia (desenvolvedor_id, tecnologia_id, nivel, evidencia)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [developerId, input.tecnologia_id, input.nivel, input.evidencia],
      );
      const created = await findCompetency(client, developerId, rows[0]!.id);
      await client.query("UPDATE desenvolvedor SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [developerId]);
      await auditService.record(
        {
          usuario_id: actorUserId,
          entidade_tipo: "competencia",
          entidade_id: created.id,
          acao: "REGISTRAR_COMPETENCIA",
          dados_json: {
            desenvolvedor_id: developerId,
            tecnologia_id: created.tecnologia_id,
            tecnologia_nome: created.tecnologia_nome,
            nivel: created.nivel,
            evidencia: created.evidencia,
          },
        },
        client,
      );
      return created;
    });
  }

  async update(
    developerId: string,
    competencyId: string,
    input: CompetencyUpdate,
    actorUserId: string,
  ): Promise<Competency> {
    return withTransaction(this.db as Pool, async (client) => {
      await lockDeveloper(client, developerId);
      const before = await findCompetency(client, developerId, competencyId);
      await client.query(
        `UPDATE competencia
         SET nivel = COALESCE($3, nivel), evidencia = COALESCE($4, evidencia), updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND desenvolvedor_id = $2`,
        [competencyId, developerId, input.nivel ?? null, input.evidencia ?? null],
      );
      const updated = await findCompetency(client, developerId, competencyId);
      await client.query("UPDATE desenvolvedor SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [developerId]);
      await auditService.record(
        {
          usuario_id: actorUserId,
          entidade_tipo: "competencia",
          entidade_id: competencyId,
          acao: "ATUALIZAR_COMPETENCIA",
          dados_json: {
            desenvolvedor_id: developerId,
            antes: { nivel: before.nivel, evidencia: before.evidencia },
            depois: { nivel: updated.nivel, evidencia: updated.evidencia },
          },
        },
        client,
      );
      return updated;
    });
  }

  async remove(developerId: string, competencyId: string, actorUserId: string): Promise<void> {
    await withTransaction(this.db as Pool, async (client) => {
      await lockDeveloper(client, developerId);
      const removed = await findCompetency(client, developerId, competencyId);
      await client.query("DELETE FROM competencia WHERE id = $1", [competencyId]);
      await client.query("UPDATE desenvolvedor SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [developerId]);
      await auditService.record(
        {
          usuario_id: actorUserId,
          entidade_tipo: "competencia",
          entidade_id: competencyId,
          acao: "REMOVER_COMPETENCIA",
          dados_json: {
            desenvolvedor_id: developerId,
            tecnologia_nome: removed.tecnologia_nome,
            nivel: removed.nivel,
            evidencia: removed.evidencia,
          },
        },
        client,
      );
    });
  }
}
