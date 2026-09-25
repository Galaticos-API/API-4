import type { PoolClient } from "pg";
import { ValidationError } from "../../shared/errors.js";

export type BacklogEntityType = "epico" | "feature" | "pbi";

export async function replaceEntityTechnologies(
  client: PoolClient,
  entityType: BacklogEntityType,
  entityId: string,
  technologyIds: string[] | undefined,
): Promise<void> {
  if (technologyIds === undefined) return;

  const uniqueIds = [...new Set(technologyIds)];
  if (uniqueIds.length > 0) {
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM tecnologia WHERE id = ANY($1::uuid[])",
      [uniqueIds],
    );
    if (existing.rowCount !== uniqueIds.length) {
      throw new ValidationError("Uma ou mais tecnologias selecionadas não existem.");
    }
  }

  await client.query(
    "DELETE FROM entidade_tecnologia WHERE entidade_tipo = $1 AND entidade_id = $2",
    [entityType, entityId],
  );

  if (uniqueIds.length > 0) {
    await client.query(
      `INSERT INTO entidade_tecnologia (entidade_tipo, entidade_id, tecnologia_id)
       SELECT $1, $2, input.technology_id
       FROM unnest($3::uuid[]) AS input(technology_id)`,
      [entityType, entityId, uniqueIds],
    );
  }
}

export async function getEntityTechnologyIds(
  client: PoolClient,
  entityType: BacklogEntityType,
  entityId: string,
): Promise<string[]> {
  const result = await client.query<{ tecnologias_ids: string[] }>(
    `SELECT COALESCE(array_agg(tecnologia_id ORDER BY tecnologia_id), ARRAY[]::uuid[]) AS tecnologias_ids
     FROM entidade_tecnologia
     WHERE entidade_tipo = $1 AND entidade_id = $2`,
    [entityType, entityId],
  );
  return result.rows[0]?.tecnologias_ids ?? [];
}
