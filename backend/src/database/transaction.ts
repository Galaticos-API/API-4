import type { Pool, PoolClient } from "pg";

/** Keeps every query in a unit of work on the same connection. */
export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
  mode: "write" | "snapshot" = "write",
): Promise<T> {
  const client = await pool.connect();
  let connectionError: Error | boolean | undefined;
  try {
    await client.query(mode === "snapshot" ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // A broken connection must not be returned to the pool for reuse.
      connectionError = rollbackError instanceof Error ? rollbackError : true;
      throw error;
    }
    throw error;
  } finally {
    client.release(connectionError);
  }
}
