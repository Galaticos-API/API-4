import type { Pool } from "pg";
import { pool } from "../../database/db.js";
import { withTransaction } from "../../database/transaction.js";
import { ConflictError } from "../../shared/errors.js";
import {
  defaultConfig,
  type HarnessMode,
  type HarnessConfig,
  type HarnessRevision,
} from "./harness.contract.js";

export class HarnessRepository {
  constructor(private readonly db: Pool = pool) {}
  async current(mode: HarnessMode): Promise<HarnessRevision> {
    const row = (
      await this.db.query(
        "SELECT * FROM ai_harness_revision WHERE mode=$1 ORDER BY version DESC LIMIT 1",
        [mode],
      )
    ).rows[0];
    return (
      row ?? {
        mode,
        version: 0,
        schema_version: 1,
        config: defaultConfig(mode),
        created_at: null,
        created_by: null,
      }
    );
  }
  async history(
    mode: HarnessMode,
    before?: number,
  ): Promise<HarnessRevision[]> {
    return (
      await this.db.query(
        "SELECT * FROM ai_harness_revision WHERE mode=$1 AND ($2::int IS NULL OR version<$2) ORDER BY version DESC LIMIT 50",
        [mode, before ?? null],
      )
    ).rows;
  }
  async save(
    mode: HarnessMode,
    expected: number,
    config: HarnessConfig,
    userId: string,
  ): Promise<HarnessRevision> {
    return withTransaction(this.db, async (client) => {
      // Serializa somente o modo editado, inclusive sua primeira revisão.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('ai-harness:' || $1))",
        [mode],
      );
      const latest =
        (
          await client.query(
            "SELECT version FROM ai_harness_revision WHERE mode=$1 ORDER BY version DESC LIMIT 1",
            [mode],
          )
        ).rows[0]?.version ?? 0;
      if (latest !== expected)
        throw new ConflictError(
          "A configuração foi atualizada. Recarregue a revisão antes de salvar.",
        );
      return (
        await client.query(
          "INSERT INTO ai_harness_revision(mode,version,config,created_by) VALUES($1,$2,$3,$4) RETURNING *",
          [mode, latest + 1, JSON.stringify(config), userId],
        )
      ).rows[0];
    });
  }
}
