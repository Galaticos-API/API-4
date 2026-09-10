import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { pool } from "./db.js";

const migrationsDir = join(process.cwd(), "..", "database", "migrations");

async function loadMigration(file: string): Promise<string> {
  const path = join(migrationsDir, file);
  const sql = await readFile(path, "utf8");
  // The baseline intentionally reuses the Docker bootstrap schema. Expand the
  // psql include here so the same migration can run through the Node CLI.
  return sql.replaceAll("\\ir ../init.sql", await readFile(join(migrationsDir, "../init.sql"), "utf8"));
}

async function migrate(): Promise<void> {
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .sort();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const file of files) {
      const alreadyApplied = await client.query(
        "SELECT 1 FROM _schema_migrations WHERE version = $1",
        [file],
      );
      if (alreadyApplied.rowCount) continue;

      await client.query(await loadMigration(file));
      await client.query("INSERT INTO _schema_migrations (version) VALUES ($1)", [file]);
      console.log(`[Migration] applied ${file}`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("[Migration] failed:", error);
  process.exitCode = 1;
});
