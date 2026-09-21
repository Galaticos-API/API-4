import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { EpicsRepository } from "../src/modules/epics/epics.repository.js";
import { CriteriaRepository } from "../src/modules/criteria/criteria.repository.js";
import { QualityConfigurationRepository } from "../src/modules/quality/quality.configuration.repository.js";
import { DatabaseQualityRuleConfigurationProvider, QualityService } from "../src/modules/quality/quality.service.js";
import { PbisRepository } from "../src/modules/pbis/pbis.repository.js";
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

      // Exercise the S2-19 slice against PostgreSQL: version, actor, audit, and rollback.
      const configurationRepository = new QualityConfigurationRepository(pool);
      const initialConfiguration = await configurationRepository.getPbiConfiguration();
      assert.ok(Object.values(initialConfiguration.checks).every(Boolean));
      assert.equal(initialConfiguration.checks.prototipo_vinculado, true);
      assert.equal(initialConfiguration.rule_version, "pbi-quality-v2");
      const migrationAudits = await pool.query(
        "SELECT usuario_id, dados_json FROM auditoria WHERE entidade_tipo='quality_configuration' AND acao='migration_updated' AND entidade_id=$1::uuid",
        ["00000000-0000-4000-8000-000000000001"],
      );
      assert.equal(migrationAudits.rowCount, 1);
      assert.equal(migrationAudits.rows[0].usuario_id, null);
      assert.equal(migrationAudits.rows[0].dados_json.after.checks.prototipo_vinculado, true);
      await pool.query(await sql("009_pbi_interface_quality.sql"));
      assert.equal((await configurationRepository.getPbiConfiguration()).rule_version, initialConfiguration.rule_version, "a migration repetida não pode incrementar a versão de novo");
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM auditoria WHERE entidade_tipo='quality_configuration' AND acao='migration_updated'")).rows[0].count, 1);
      const adminId = randomUUID();
      await pool.query("INSERT INTO usuario (id, nome, email, senha_hash, role) VALUES ($1, 'Admin QA', $2, 'unused', 'admin')", [adminId, `${adminId}@example.test`]);
      const changedInput = {
        checks: { ...initialConfiguration.checks, termos_vagos: false },
        vague_terms: [...initialConfiguration.vague_terms, "mensurável"],
      };
      const changedConfiguration = await configurationRepository.updatePbiConfiguration(changedInput, adminId);
      assert.notEqual(changedConfiguration.rule_version, initialConfiguration.rule_version);
      assert.equal(changedConfiguration.updated_by?.id, adminId);
      assert.ok(changedConfiguration.updated_at);
      const configAudit = await pool.query(
        "SELECT usuario_id, dados_json FROM auditoria WHERE entidade_tipo = 'quality_configuration' AND entidade_id = $1::uuid ORDER BY created_at DESC LIMIT 1",
        ["00000000-0000-4000-8000-000000000001"],
      );
      assert.equal(configAudit.rows[0].usuario_id, adminId);
      assert.equal(configAudit.rows[0].dados_json.actor_id, adminId);
      assert.equal(configAudit.rows[0].dados_json.after.checks.termos_vagos, false);
      const nonexistentAdminId = randomUUID();
      await assert.rejects(configurationRepository.updatePbiConfiguration(initialConfiguration, nonexistentAdminId), (error: any) => error?.code === "23503");
      const afterRollback = await configurationRepository.getPbiConfiguration();
      assert.equal(afterRollback.rule_version, changedConfiguration.rule_version);
      assert.deepEqual(afterRollback.checks, changedConfiguration.checks);
      await configurationRepository.updatePbiConfiguration({
        checks: initialConfiguration.checks,
        vague_terms: initialConfiguration.vague_terms,
      }, adminId);

      // Exercise production applicability against persisted PBI flags and actual
      // rows in the pre-existing prototype table, not a stub provider.
      const qualityProject = (await pool.query("INSERT INTO projeto(nome,cliente,status) VALUES ('Completude QA','QA','ativo') RETURNING id")).rows[0];
      const qualityEpic = (await pool.query("INSERT INTO epico(projeto_id,titulo,status) VALUES ($1,'Qualidade','rascunho') RETURNING id", [qualityProject.id])).rows[0];
      const qualityFeature = (await pool.query("INSERT INTO feature(epico_id,titulo,status) VALUES ($1,'Protótipo','rascunho') RETURNING id", [qualityEpic.id])).rows[0];
      const noInterfacePbi = (await pool.query(`
        INSERT INTO pbi (feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que,requer_interface)
        VALUES ($1,'QA-001','Cadastrar informação','PO','cadastrar informação','organizar dados',FALSE) RETURNING id
      `, [qualityFeature.id])).rows[0];
      const missingPrototypePbi = (await pool.query(`
        INSERT INTO pbi (feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que,requer_interface)
        VALUES ($1,'QA-002','Exibir painel','PO','exibir painel','acompanhar dados',TRUE) RETURNING id
      `, [qualityFeature.id])).rows[0];
      const linkedPrototypePbi = (await pool.query(`
        INSERT INTO pbi (feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que,requer_interface)
        VALUES ($1,'QA-003','Exibir relatório','PO','exibir relatório','consultar dados',TRUE) RETURNING id
      `, [qualityFeature.id])).rows[0];
      await pool.query("INSERT INTO prototipo (pbi_id,nome,url) VALUES ($1,'Figma QA','https://figma.com/file/qa')", [linkedPrototypePbi.id]);
      const pbisRepository = new PbisRepository(pool);
      const persistedPbis = await Promise.all([noInterfacePbi, missingPrototypePbi, linkedPrototypePbi].map(({ id }) => pbisRepository.findById(id)));
      assert.equal(persistedPbis[0]?.requer_interface, false);
      assert.equal(persistedPbis[0]?.prototipo_vinculado, false);
      assert.equal(persistedPbis[2]?.prototipo_vinculado, true);
      const qualityService = new QualityService(new CriteriaRepository(pool), pbisRepository, new DatabaseQualityRuleConfigurationProvider(configurationRepository));
      const reports = await qualityService.validatePbis(persistedPbis.filter((pbi): pbi is NonNullable<typeof pbi> => pbi !== null));
      assert.equal(reports.get(noInterfacePbi.id)?.checks.some((check) => check.check_id === "prototipo_vinculado"), false);
      assert.equal(reports.get(missingPrototypePbi.id)?.checks.find((check) => check.check_id === "prototipo_vinculado")?.passed, false);
      assert.equal(reports.get(linkedPrototypePbi.id)?.checks.find((check) => check.check_id === "prototipo_vinculado")?.passed, true);

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
      assert.equal((rejected.reason as Error).name, "ValidationError", `Expected ValidationError, received: ${String(rejected.reason)}`);
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
