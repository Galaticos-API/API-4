import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { validateTarget } from "./seed-lib.js";

const migrationPath = resolve(process.cwd(), "../database/migrations/010_hierarchy_archive.sql");

async function createPre010Schema(db: Pool, schema: string): Promise<void> {
  await db.query(`CREATE SCHEMA ${schema}`);
  await db.query(`SET search_path TO ${schema}`);
  await db.query("CREATE TABLE projeto (id uuid PRIMARY KEY, status varchar(50) NOT NULL DEFAULT 'ativo')");
  await db.query("CREATE TABLE epico (id uuid PRIMARY KEY, projeto_id uuid NOT NULL, status varchar(50) NOT NULL DEFAULT 'rascunho')");
  await db.query("CREATE TABLE feature (id uuid PRIMARY KEY, epico_id uuid NOT NULL, status varchar(50) NOT NULL DEFAULT 'rascunho')");
  await db.query("CREATE TABLE pbi (id uuid PRIMARY KEY, feature_id uuid NOT NULL, status varchar(50) NOT NULL DEFAULT 'rascunho')");
}

test("migration 010: aplica em schema limpo e legado sem default incompatível", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async (t) => {
  const db = new Pool({ max: 1, connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const migration = await readFile(migrationPath, "utf8");
  const schemas = [`migration_clean_${randomUUID().replaceAll("-", "")}`, `migration_legacy_${randomUUID().replaceAll("-", "")}`];
  try {
    await t.test("schema limpo: inserts sem status usam rascunho aceito pelo CHECK", async () => {
      const schema = schemas[0];
      await createPre010Schema(db, schema);
      await db.query(migration);
      const [project, epic, feature, pbi] = Array.from({ length: 4 }, randomUUID);
      await db.query("INSERT INTO projeto(id) VALUES ($1)", [project]);
      await db.query("INSERT INTO epico(id,projeto_id) VALUES ($1,$2)", [epic, project]);
      await db.query("INSERT INTO feature(id,epico_id) VALUES ($1,$2)", [feature, epic]);
      await db.query("INSERT INTO pbi(id,feature_id) VALUES ($1,$2)", [pbi, feature]);
      assert.deepEqual((await db.query("SELECT status FROM feature WHERE id=$1", [feature])).rows[0], { status: "rascunho" });
      assert.deepEqual((await db.query("SELECT status FROM pbi WHERE id=$1", [pbi])).rows[0], { status: "rascunho" });
    });

    await t.test("dados existentes: descendentes de projeto arquivado são preservados como arquivados", async () => {
      const schema = schemas[1];
      await createPre010Schema(db, schema);
      const [project, epic, feature, pbi] = Array.from({ length: 4 }, randomUUID);
      await db.query("INSERT INTO projeto(id,status) VALUES ($1,'arquivado')", [project]);
      await db.query("INSERT INTO epico(id,projeto_id,status) VALUES ($1,$2,'rascunho')", [epic, project]);
      await db.query("INSERT INTO feature(id,epico_id,status) VALUES ($1,$2,'rascunho')", [feature, epic]);
      await db.query("INSERT INTO pbi(id,feature_id,status) VALUES ($1,$2,'rascunho')", [pbi, feature]);
      await db.query(migration);
      for (const [table, id] of [["epico", epic], ["feature", feature], ["pbi", pbi]]) {
        assert.equal((await db.query(`SELECT status FROM ${table} WHERE id=$1`, [id])).rows[0].status, "arquivado");
      }
    });
  } finally {
    await db.query("RESET search_path");
    for (const schema of schemas) await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await db.end();
  }
});
