import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { validateTarget } from "./seed-lib.js";
import { applyUntil, loadMigration, migrationFiles, withDatabase } from "./migration-test-utils.js";

const DECISION_MIGRATION = "013_decision_records.sql";

test("migration 013 vem depois da 012 e é a única com esse número", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async () => {
  const files = await migrationFiles();
  assert.ok(files.indexOf(DECISION_MIGRATION) > files.indexOf("012_document_upload.sql"));
  assert.equal(files.filter((file) => file.startsWith("013_")).length, 1);
});

test("migration 013 preserva decisões antigas, preenche o texto da decisão e é idempotente", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async () => {
  await withDatabase(validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test"), async (client, vectorAvailable) => {
    await applyUntil(client, vectorAvailable, (file) => file === DECISION_MIGRATION);
    const legacy = randomUUID();
    const legacyEntity = randomUUID();
    await client.query("INSERT INTO decisao (id,entidade_tipo,entidade_id,titulo,contexto,justificativa,alternativas) VALUES ($1,'pbi',$2,'Título legado','Contexto legado','Motivo legado','Alt legada')", [legacy, legacyEntity]);
    await client.query("INSERT INTO decisao (entidade_tipo,entidade_id,titulo,contexto,justificativa) VALUES ('documento',$1,'Tipo antigo','c','j')", [randomUUID()]);

    await applyUntil(client, vectorAvailable, () => false);
    const migrated = (await client.query("SELECT titulo, decisao, contexto, justificativa, alternativas FROM decisao WHERE id=$1", [legacy])).rows[0];
    assert.deepEqual(migrated, { titulo: "Título legado", decisao: "Título legado", contexto: "Contexto legado", justificativa: "Motivo legado", alternativas: "Alt legada" });
    assert.equal((await client.query("SELECT count(*)::int AS n FROM decisao")).rows[0].n, 2, "linhas antigas com tipo desconhecido não são removidas");

    await assert.rejects(client.query("INSERT INTO decisao (entidade_tipo,entidade_id,titulo,contexto,decisao,justificativa) VALUES ('documento',$1,'x','c','d','j')", [randomUUID()]), /ck_decisao_entidade_tipo/);
    await assert.rejects(client.query("INSERT INTO decisao (entidade_tipo,entidade_id,titulo,contexto,justificativa) VALUES ('pbi',$1,'x','c','j')", [randomUUID()]), /null value/);

    const migration = await loadMigration(DECISION_MIGRATION, vectorAvailable);
    await client.query(migration);
    await client.query(migration);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM decisao")).rows[0].n, 2);
    const indexes = (await client.query("SELECT indexname FROM pg_indexes WHERE tablename='decisao'")).rows.map((row) => row.indexname);
    assert.ok(indexes.includes("idx_decisao_entidade_data"));
  });
});
