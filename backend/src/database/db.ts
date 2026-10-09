import { Pool, type PoolClient } from "pg";
import { env } from "../config/env.js";
import { databasePoolConfig } from './pool-config.js';

export const pool = new Pool(databasePoolConfig(env));

export async function checkDatabaseConnection(db: Pick<Pool, "connect"> = pool): Promise<boolean> {
  let client: PoolClient | undefined;
  let failed = false;
  try {
    client = await db.connect();
    await client.query("SELECT 1");
    return true;
  } catch (error) {
    failed = true;
    console.error("[Database] Failed to connect to PostgreSQL:", error);
    return false;
  } finally {
    client?.release(failed);
  }
}
