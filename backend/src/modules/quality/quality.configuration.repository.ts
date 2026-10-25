import { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { auditService } from "../audit/audit.service.js";
import { ConflictError, ValidationError } from "../../shared/errors.js";
import { effectiveConfiguration, type OrganizationConfigurationInput } from './organization-quality.types.js';
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
    exigir_justificativa_item_concluido?: boolean;
  };
  updated_at: Date | string;
  updated_by: string | null;
  updated_by_name: string | null;
};

export class QualityConfigurationRepository {
  constructor(private readonly db: Pool = pool) {}

  async getOrganizationConfiguration(executor: Pool | PoolClient = this.db, lock = false) {
    const result = await executor.query(`SELECT c.*,COALESCE(u.nome,h.updated_by_name) AS updated_by_name FROM quality_configuration c
      LEFT JOIN usuario u ON u.id=c.updated_by LEFT JOIN quality_configuration_history h ON h.version=c.version
      WHERE c.id=$1 ${lock ? 'FOR SHARE OF c' : ''}`,[CONFIGURATION_ID]);
    const row=result.rows[0];
    if(!row) throw new Error('Configuração de qualidade não encontrada. Aplique as migrations do banco.');
    return effectiveConfiguration(row.configuration,row.version,row.updated_at,
      row.updated_by || row.updated_by_name ? {id:row.updated_by,nome:row.updated_by_name ?? 'Usuário não identificado'} : null);
  }

  async updateOrganizationConfiguration(input: OrganizationConfigurationInput, userId: string) {
    this.validate({checks:input.levels.pbi,vague_terms:input.vague_terms});
    const client=await this.db.connect();
    try {
      await client.query('BEGIN');
      const before=(await client.query('SELECT * FROM quality_configuration WHERE id=$1 FOR UPDATE',[CONFIGURATION_ID])).rows[0];
      if(!before || before.version!==input.expected_version) throw new ConflictError('A configuração mudou. Recarregue antes de salvar.');
      const configuration={...before.configuration,checks:input.levels.pbi,
        levels:{epico:input.levels.epico,feature:input.levels.feature},vague_terms:input.vague_terms,
        exigir_justificativa_item_concluido:input.exigir_justificativa_item_concluido};
      await client.query(`UPDATE quality_configuration SET version=version+1,configuration=$2::jsonb,
        updated_by=$3,updated_at=clock_timestamp() WHERE id=$1`,[CONFIGURATION_ID,JSON.stringify(configuration),userId]);
      await auditService.record({usuario_id:userId,entidade_tipo:'quality_configuration',entidade_id:CONFIGURATION_ID,
        acao:'ATUALIZAR_QUALIDADE_ORGANIZACAO',dados_json:{version:before.version+1,before:before.configuration,after:configuration}},client);
      const result=await this.getOrganizationConfiguration(client);
      await client.query('COMMIT');
      return result;
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async organizationHistory(limit: number, before?: number) {
    const rows=(await this.db.query(`SELECT * FROM quality_configuration_history
      WHERE ($1::integer IS NULL OR version<$1) ORDER BY version DESC LIMIT $2`,[before ?? null,limit+1])).rows;
    return {items:rows.slice(0,limit).map(row=>effectiveConfiguration(row.configuration,row.version,row.updated_at,
      row.updated_by || row.updated_by_name ? {id:row.updated_by,nome:row.updated_by_name ?? 'Usuário não identificado'} : null)),
      next_before:rows.length>limit ? rows[limit-1].version as number : null};
  }

  async getPbiConfiguration(
    executor: Pool | PoolClient = this.db,
    options: { lock?: boolean } = {},
  ): Promise<PbiQualityConfigurationRecord> {
    const result = await executor.query<ConfigurationRow>(
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
        ${options.lock ? "FOR SHARE OF c" : ""}
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
          JSON.stringify({
            ...before.configuration,
            ...input,
            exigir_justificativa_item_concluido:
              input.exigir_justificativa_item_concluido
              ?? before.configuration.exigir_justificativa_item_concluido
              ?? true,
          }),
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
            after: after.configuration,
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
              .normalize('NFC')
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
      exigir_justificativa_item_concluido:
        raw.exigir_justificativa_item_concluido ?? true,
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
