import type { Pool } from "pg";
import { pool } from "../../database/db.js";

export class TechnologiesRepository {
  constructor(private readonly db: Pick<Pool, "query"> = pool) {}

  async list(): Promise<Array<{ id: string; nome: string }>> {
    const { rows } = await this.db.query<{ id: string; nome: string }>(
      "SELECT id, nome FROM tecnologia ORDER BY nome ASC, id ASC",
    );
    return rows;
  }
}
