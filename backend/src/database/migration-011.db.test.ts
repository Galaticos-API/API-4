import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { validateTarget } from "./seed-lib.js";

const migrationPath = resolve(process.cwd(), "../database/migrations/011_unique_entity_technology.sql");

test("migration 011 remove vínculos duplicados e pode ser reaplicada", { skip: !process.env.BACKLOG_TREE_TEST_DATABASE_URL }, async () => {
  const db = new Pool({ max: 1, connectionString: validateTarget(process.env.BACKLOG_TREE_TEST_DATABASE_URL, "test") });
  const schema = `technology_migration_${randomUUID().replaceAll("-", "")}`;
  const migration = await readFile(migrationPath, "utf8");
  const entityId = randomUUID();
  const technologyId = randomUUID();
  try {
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`SET search_path TO ${schema}`);
    await db.query("CREATE TABLE entidade_tecnologia (id uuid PRIMARY KEY, entidade_tipo text NOT NULL, entidade_id uuid NOT NULL, tecnologia_id uuid NOT NULL)");
    await db.query(
      "INSERT INTO entidade_tecnologia VALUES ($1,'pbi',$3,$4),($2,'pbi',$3,$4)",
      [randomUUID(), randomUUID(), entityId, technologyId],
    );

    await db.query(migration);
    assert.equal((await db.query("SELECT count(*)::int AS total FROM entidade_tecnologia")).rows[0].total, 1);
    await assert.rejects(
      db.query("INSERT INTO entidade_tecnologia VALUES ($1,'pbi',$2,$3)", [randomUUID(), entityId, technologyId]),
      /duplicate key/i,
    );

    await db.query(migration);
    assert.equal((await db.query("SELECT count(*)::int AS total FROM entidade_tecnologia")).rows[0].total, 1);
  } finally {
    await db.query("RESET search_path");
    await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await db.end();
  }
});
