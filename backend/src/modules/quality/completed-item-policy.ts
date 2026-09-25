import type { Pool, PoolClient } from "pg";
import { NotFoundError, ValidationError } from "../../shared/errors.js";
import { qualityConfigurationRepository } from "./quality.configuration.repository.js";
import type { EntityType } from "./quality.types.js";

const ENTITY_TABLE: Record<EntityType, string> = {
  epico: "epico",
  feature: "feature",
  pbi: "pbi",
};

export const JUSTIFICATION_REQUIRED_MESSAGE =
  "A justificativa é obrigatória ao alterar um item concluído.";

/**
 * Authoritative policy check for writes: callers must invoke it after acquiring
 * the hierarchy/entity locks and pass the same transaction client used to write.
 */
export async function assertJustificationForCompletedItem(
  client: Pool | PoolClient,
  entityType: EntityType,
  entityId: string,
  justification?: string | null,
): Promise<void> {
  const table = ENTITY_TABLE[entityType];
  const entity = await client.query<{ status: string }>(
    `SELECT status FROM ${table} WHERE id = $1`,
    [entityId],
  );
  const status = entity.rows[0]?.status;

  if (status === undefined) {
    throw new NotFoundError("Item não encontrado.");
  }
  if (status !== "concluido") return;

  const configuration = await qualityConfigurationRepository.getPbiConfiguration(
    client,
    { lock: true },
  );
  if (
    configuration.exigir_justificativa_item_concluido
    && !justification?.trim()
  ) {
    throw new ValidationError(JUSTIFICATION_REQUIRED_MESSAGE, {
      code: "JUSTIFICATIVA_REQUERIDA",
      campo: "justificativa",
    });
  }
}

export function normalizeJustification(
  justification?: string | null,
): string | null {
  const normalized = justification?.trim();
  return normalized || null;
}
