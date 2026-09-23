import { Pool } from "pg";
import { pool } from "../../database/db.js";
import { auditService } from "../audit/audit.service.js";
import { ValidationError } from "../../shared/errors.js";
import {
  PBI_QUALITY_CHECKS,
  PbiQualityCheck,
  PbiQualityConfigurationInput,
  PbiQualityConfigurationRecord,
} from "./quality.types.js";
import { TERMOS_VAGOS_PADRAO } from "./quality.rules.js";

const CONFIGURATION_ID = "00000000-0000-4000-8000-000000000001";

type ConfigurationRow = {
  id: string;
  version: number;
  configuration: {
    checks: Record<string, boolean>;
    vague_terms: string[];
  };
  updated_at: Date | string;
  updated_by: string | null;
  updated_by_name: string | null;
};

export class QualityConfigurationRepository {
  constructor(private readonly db: Pool = pool) {}

  async getPbiConfiguration(): Promise<PbiQualityConfigurationRecord> {
    const result = await this.db.query<ConfigurationRow>(
      `
        SELECT
          c.id,
          c.version,
          c.configuration,
          c.updated_at,
          c.updated_by,
          u.nome AS updated_by_name
        FROM quality_configuration c
        LEFT JOIN usuario u ON u.id = c.updated_by
        WHERE c.id = $1
      `,
      [CONFIGURATION_ID],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error(
        "Configuração de qualidade não encontrada. Aplique as migrations do banco.",
      );
    }

    return this.toRecord(row);
  }

  async updatePbiConfiguration(
    input: PbiQualityConfigurationInput,
    usuarioId: string,
  ): Promise<PbiQualityConfigurationRecord> {
    this.validate(input);

    const client = await this.db.connect();

    try {
      await client.query("BEGIN");

      const beforeResult = await client.query<ConfigurationRow>(
        `
          SELECT
            c.id,
            c.version,
            c.configuration,
            c.updated_at,
            c.updated_by,
            u.nome AS updated_by_name
          FROM quality_configuration c
          LEFT JOIN usuario u ON u.id = c.updated_by
          WHERE c.id = $1
          FOR UPDATE OF c
        `,
        [CONFIGURATION_ID],
      );

      const before = beforeResult.rows[0];

      if (!before) {
        throw new Error(
          "Configuração de qualidade não encontrada. Aplique as migrations do banco.",
        );
      }

      const updatedResult = await client.query<ConfigurationRow>(
        `
          UPDATE quality_configuration
          SET
            version = version + 1,
            configuration = $2::jsonb,
            updated_by = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING
            id,
            version,
            configuration,
            updated_at,
            updated_by,
            NULL::text AS updated_by_name
        `,
        [
          CONFIGURATION_ID,
          JSON.stringify(input),
          usuarioId,
        ],
      );

      const after = updatedResult.rows[0];

      await auditService.record(
        {
          usuario_id: usuarioId,
          entidade_tipo: "quality_configuration",
          entidade_id: CONFIGURATION_ID,
          acao: "updated",
          dados_json: {
            actor_id: usuarioId,
            before: before.configuration,
            after: input,
            version: after.version,
          },
        },
        client,
      );

      const userResult = await client.query<{
        id: string;
        nome: string;
      }>(
        "SELECT id, nome FROM usuario WHERE id = $1",
        [usuarioId],
      );

      await client.query("COMMIT");

      return this.toRecord({
        ...after,
        updated_by_name:
          userResult.rows[0]?.nome ?? null,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private validate(
    input: PbiQualityConfigurationInput,
  ): void {
    const allowed = new Set<string>(
      PBI_QUALITY_CHECKS,
    );

    if (
      !input
      || !input.checks
      || PBI_QUALITY_CHECKS.some(
        (id) =>
          typeof input.checks[id] !== "boolean",
      )
      || Object.keys(input.checks).some(
        (id) => !allowed.has(id),
      )
    ) {
      throw new ValidationError(
        "Informe o estado (true/false) das cinco verificações de PBI.",
      );
    }

    if (
      !Array.isArray(input.vague_terms)
      || input.vague_terms.length > 100
      || input.vague_terms.some(
        (term) =>
          typeof term !== "string"
          || !term.trim()
          || term.trim().length > 80,
      )
      || new Set(
        input.vague_terms.map(
          (term) =>
            term
              .trim()
              .toLocaleLowerCase("pt-BR"),
        ),
      ).size !== input.vague_terms.length
    ) {
      throw new ValidationError(
        "A lista de termos vagos deve conter até 100 termos únicos, com até 80 caracteres cada.",
      );
    }
  }

  private toRecord(
    row: ConfigurationRow,
  ): PbiQualityConfigurationRecord {
    const raw = row.configuration;

    const checks = Object.fromEntries(
      PBI_QUALITY_CHECKS.map(
        (check) => [
          check,
          raw.checks?.[check] ?? true,
        ],
      ),
    ) as Record<PbiQualityCheck, boolean>;

    return {
      rule_version: `pbi-quality-v${row.version}`,
      checks,
      vague_terms:
        raw.vague_terms
        ?? [...TERMOS_VAGOS_PADRAO],
      updated_at:
        new Date(row.updated_at).toISOString(),
      updated_by:
        row.updated_by && row.updated_by_name
          ? {
              id: row.updated_by,
              nome: row.updated_by_name,
            }
          : null,
    };
  }
}

export const qualityConfigurationRepository =
  new QualityConfigurationRepository();