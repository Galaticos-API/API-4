import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readdir } from "node:fs/promises";
import { pool } from "./db.js";

// npm runs scripts with backend/ as the working directory, including when
// invoked from the repository root via `npm --prefix backend run migrate`.
const migrationsDir = process.env.MIGRATIONS_DIR
  ? resolve(process.env.MIGRATIONS_DIR)
  : resolve(process.cwd(), "../database/migrations");

async function loadMigration(file: string): Promise<string> {
  const path = join(migrationsDir, file);
  const sql = await readFile(path, "utf8");
  const initSqlPath = process.env.INIT_SQL_PATH
    ? resolve(process.env.INIT_SQL_PATH)
    : join(migrationsDir, "../init.sql");
  return sql.replaceAll("\\ir ../init.sql", await readFile(initSqlPath, "utf8"));
}

async function migrate(): Promise<void> {
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .sort();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Se solicitado para ambiente de desenvolvimento local, trunca/limpa o banco antes de aplicar migrations e seeds
    if (process.env.RESET_DATABASE_ON_START === "true" || process.env.RESET_DATABASE_ON_START === "1") {
      console.log("[Migration] RESET_DATABASE_ON_START ativo: limpando todas as tabelas, views e funções do banco...");
      await client.query(`
        DO $$
        DECLARE
          r RECORD;
        BEGIN
          -- 1. Drop views
          FOR r IN (
            SELECT table_name FROM information_schema.views
            WHERE table_schema = 'public'
          ) LOOP
            EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.table_name) || ' CASCADE';
          END LOOP;

          -- 2. Drop tables
          FOR r IN (
            SELECT tablename FROM pg_tables 
            WHERE schemaname = 'public' 
              AND tablename NOT IN ('spatial_ref_sys')
          ) LOOP
            EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;

          -- 3. Drop user-defined functions in public schema (ignoring internal extension functions)
          FOR r IN (
            SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN (
                'increment_analysis_revision',
                'queue_analysis_report',
                'remove_analysis_report_chunks',
                'sincronizar_indice_projeto',
                'publicar_evento_indice'
              )
          ) LOOP
            EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.args || ') CASCADE';
          END LOOP;
        END $$;
      `);
      console.log("[Migration] Banco truncado/limpo com sucesso.");
    }

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

    // Aplica o seed de desenvolvimento automaticamente (idempotente)
    const seedPath = resolve(migrationsDir, "../seed/dev_seed.sql");
    try {
      const seedSql = await readFile(seedPath, "utf8");
      await client.query(seedSql);
      console.log("[Migration] Seed de desenvolvimento aplicado com sucesso.");
    } catch (seedError) {
      console.error("[Migration] Erro ao aplicar seed de desenvolvimento:", seedError);
      throw seedError;
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
