// One-off script for native (non-Docker) local setup without pgvector.
// Applies database/init.sql + migrations/*.sql to a real local Postgres,
// stripping the pgvector extension/column/index (same shim used by
// migration-test-utils.ts for the test suite), so embeddings fall back to
// real[] storage. Vector similarity search will not work; full-text search
// and the rest of the app function normally.
import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(new URL(".", import.meta.url).pathname.slice(1), "../..");
const dir = join(REPO, "database/migrations");

const client = new pg.Client({
  host: "localhost",
  port: 5432,
  user: "sinapse",
  password: "sinapse_dev_password",
  database: "sinapse",
});
await client.connect();

const shim = (sql) =>
  sql
    .replace(/CREATE EXTENSION IF NOT EXISTS vector;/g, "")
    .replace(/vector\(1024\)/g, "real[]")
    .replace(/^.*USING hnsw.*$/gm, "")
    .replace(/embedding <=> \$\d+::vector/g, "0")
    .replace(/::vector/g, "");

const initSql = shim(readFileSync(join(REPO, "database/init.sql"), "utf8"));
const files = readdirSync(dir)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort();

await client.query(
  "CREATE TABLE IF NOT EXISTS _schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)",
);

for (const file of files) {
  const already = await client.query("SELECT 1 FROM _schema_migrations WHERE version=$1", [file]);
  if (already.rowCount) {
    console.log("skip", file);
    continue;
  }
  const sql = shim(readFileSync(join(dir, file), "utf8")).replaceAll("\\ir ../init.sql", initSql);
  try {
    await client.query(sql);
    await client.query("INSERT INTO _schema_migrations (version) VALUES ($1)", [file]);
    console.log("applied", file);
  } catch (error) {
    console.error("FAILED", file, error.message);
    process.exitCode = 1;
    break;
  }
}

await client.end();
