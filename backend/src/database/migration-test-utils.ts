import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "pg";

const migrationsDir = resolve(process.cwd(), "../database/migrations");

export async function migrationFiles(): Promise<string[]> {
  return (await readdir(migrationsDir)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
}

function connectionFor(adminUrl: string, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

export async function loadMigration(file: string, vectorAvailable: boolean): Promise<string> {
  let sql = await readFile(join(migrationsDir, file), "utf8");
  sql = sql.replaceAll("\\ir ../init.sql", await readFile(join(migrationsDir, "../init.sql"), "utf8"));
  if (vectorAvailable) return sql;
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS vector;/g, "")
    .replace(/vector\(1024\)/g, "real[]")
    .replace(/^.*USING hnsw.*$/gm, "");
}

export async function applyUntil(client: Client, vectorAvailable: boolean, stop: (file: string) => boolean): Promise<void> {
  await client.query("CREATE TABLE IF NOT EXISTS _schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  for (const file of await migrationFiles()) {
    if (stop(file)) return;
    const applied = await client.query("SELECT 1 FROM _schema_migrations WHERE version=$1", [file]);
    if (applied.rowCount) continue;
    await client.query(await loadMigration(file, vectorAvailable));
    await client.query("INSERT INTO _schema_migrations (version) VALUES ($1)", [file]);
  }
}

export async function withDatabase(adminUrl: string, run: (client: Client, vectorAvailable: boolean) => Promise<void>): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const database = `migration_${randomUUID().replaceAll("-", "").slice(0, 16)}_test`;
  const vector = await admin.query("SELECT 1 FROM pg_available_extensions WHERE name='vector'");
  const vectorAvailable = Boolean(vector.rowCount);
  await admin.query(`CREATE DATABASE ${database}`);
  const client = new Client({ connectionString: connectionFor(adminUrl, database) });
  try {
    await client.connect();
    await run(client, vectorAvailable);
  } finally {
    await client.end().catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await admin.end();
  }
}
