import { Pool, type PoolClient } from "pg";
import { env } from "../config/env.js";

export const pool = new Pool({
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DB,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

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
