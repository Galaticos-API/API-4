import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { EpicsRepository } from "../src/modules/epics/epics.repository.js";
import { CriteriaRepository } from "../src/modules/criteria/criteria.repository.js";
import { ValidationError } from "../src/shared/errors.js";

// Never run fixtures on an application database, even if this variable was set accidentally.
const connectionString = process.env.S105_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Defina S105_TEST_DATABASE_URL para um PostgreSQL descartável local.");
const target = new URL(connectionString);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || !target.pathname.endsWith("_s105_test")) {
  throw new Error("A validação exige host local e banco com sufixo _s105_test.");
}
const migrationsDir = fileURLToPath(new URL("../../database/migrations/", import.meta.url));
const files = (await readdir(migrationsDir)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
const baseline = await readFile(join(migrationsDir, "../init.sql"), "utf8");
const sql = async (name: string) => (await readFile(join(migrationsDir, name), "utf8")).replaceAll("\\ir ../init.sql", baseline);
const admin = new pg.Pool({ connectionString });
let expectedConstraint: string | undefined;
try {
  await admin.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS unaccent');
  for (const scenario of ["empty", "legacy", "backlog", "both"]) {
    const schema = `qa_s105_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new pg.Pool({ connectionString, options: `-c search_path=${schema},public` });
    try {
      await pool.query("CREATE TABLE _schema_migrations (version text PRIMARY KEY)");
      const apply = async (name: string) => {
        const result = await pool.query("SELECT 1 FROM _schema_migrations WHERE version=$1", [name]);
        if (result.rowCount) return;
        const client = await pool.connect();
        try {
          await client.query("BEGIN"); await client.query(await sql(name));
          await client.query("INSERT INTO _schema_migrations VALUES ($1)", [name]);
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
        finally { client.release(); }
      };
      if (scenario !== "empty") {
        for (const name of files.filter((name) => /^(001|002|003|004_identity)/.test(name))) await apply(name);
        if (scenario === "legacy" || scenario === "both") await apply("005_epico_guia_fields.sql");
        if (scenario === "backlog" || scenario === "both") await apply("005_backlog_hierarchy_domain.sql");
      }
      let legacyEpicId: string | undefined;
      let criterionIds: string[] = [];
      if (scenario === "legacy") {
        const project = await pool.query("INSERT INTO projeto(nome,cliente,status) VALUES ('Legado','QA','ativo') RETURNING id");
        const epic = await pool.query("INSERT INTO epico(projeto_id,titulo,status) VALUES ($1,'Preservar estado','arquivado') RETURNING id", [project.rows[0].id]);
        legacyEpicId = epic.rows[0].id;
        const criteria = await pool.query("INSERT INTO criterio_aceitacao(entidade_tipo,entidade_id,texto) VALUES ('epico',$1,'Primeiro'),('epico',$1,'Segundo') RETURNING id", [legacyEpicId]);
        criterionIds = criteria.rows.map((row) => row.id);
      }
      for (const name of files) await apply(name);
      const before = await pool.query("SELECT * FROM criterio_aceitacao ORDER BY id");
      for (const name of files) await apply(name);
      assert.deepEqual((await pool.query("SELECT * FROM criterio_aceitacao ORDER BY id")).rows, before.rows);
      const constraint = (await pool.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='epico'::regclass AND conname='ck_epico_status'")).rows[0].definition;
      if (expectedConstraint) assert.equal(constraint, expectedConstraint); else expectedConstraint = constraint;
      if (legacyEpicId) {
        assert.equal((await pool.query("SELECT status FROM epico WHERE id=$1", [legacyEpicId])).rows[0].status, "arquivado");
        const rows = (await pool.query("SELECT id,ordem FROM criterio_aceitacao ORDER BY ordem")).rows;
        assert.deepEqual(rows.map((row) => row.ordem), [1, 2]);
        assert.deepEqual(rows.map((row) => row.id).sort(), criterionIds.sort());
      }
      // Exercise the actual SQL repository: a failed audit FK must roll back the epic too.
      const project = (await pool.query("INSERT INTO projeto(nome,cliente,status) VALUES ('Transação','QA','ativo') RETURNING id")).rows[0];
      const repo = new EpicsRepository(pool);
      const data = { projeto_id: project.id, titulo: "Rollback", prioridade: "Must" as const };
      await assert.rejects(repo.create(data, randomUUID()));
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM epico WHERE titulo='Rollback'")).rows[0].n, 0);
      const created = await repo.create(data, null);
      assert.equal(created.status, "rascunho");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM auditoria WHERE entidade_id=$1", [created.id])).rows[0].n, 1);
      await assert.rejects(repo.update(created.id, { titulo: "Não persistir" }, randomUUID()));
      assert.equal((await repo.findById(created.id))?.titulo, "Rollback");
      await assert.rejects(repo.markConcluded(created.id, randomUUID()));
      assert.equal((await repo.findById(created.id))?.status, "rascunho");

      // Two concurrent requests must not both remove the last two criteria from a
      // completed epic. The repository rechecks the invariant after taking its lock.
      const completedEpic = await repo.create({ ...data, titulo: "Concorrência" }, null);
      await pool.query("UPDATE epico SET status='concluido' WHERE id=$1", [completedEpic.id]);
      const insertedCriteria = await pool.query(
        "INSERT INTO criterio_aceitacao (entidade_tipo,entidade_id,texto,ordem) VALUES ('epico',$1,'Um',1),('epico',$1,'Dois',2) RETURNING id",
        [completedEpic.id],
      );
      const criteriaRepo = new CriteriaRepository(pool);
      const concurrentDeletes = await Promise.allSettled(
        insertedCriteria.rows.map(({ id }) => criteriaRepo.delete(id)),
      );
      assert.equal(concurrentDeletes.filter((result) => result.status === "fulfilled").length, 1);
      const rejected = concurrentDeletes.find((result) => result.status === "rejected");
      assert.ok(rejected && rejected.status === "rejected");
      assert.ok(rejected.reason instanceof ValidationError, `Expected ValidationError, received: ${String(rejected.reason)}`);
      assert.equal(
        (await pool.query("SELECT COUNT(*)::int AS total FROM criterio_aceitacao WHERE entidade_tipo='epico' AND entidade_id=$1", [completedEpic.id])).rows[0].total,
        1,
      );
      console.log(`OK ${scenario}: migrations, repetição, dados preservados e rollback de auditoria`);
    } finally {
      await pool.end();
      // This schema was generated by this run inside the explicitly disposable QA database.
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    }
  }
} finally { await admin.end(); }
