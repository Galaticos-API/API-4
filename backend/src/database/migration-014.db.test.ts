import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { validateTarget } from "./seed-lib.js";
import { applyUntil, loadMigration, migrationFiles, withDatabase } from "./migration-test-utils.js";

const SUGGESTIONS_MIGRATION = "014_suggestions_and_field_provenance.sql";

test("migration 014 vem depois da 013 e é a única com esse número", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async () => {
  const files = await migrationFiles();
  assert.ok(files.indexOf(SUGGESTIONS_MIGRATION) > files.indexOf("013_decision_records.sql"));
  assert.equal(files.filter((file) => file.startsWith("014_")).length, 1);
});

test("migration 014 cria provenance_json e sugestao_ia, preserva dados legados e é idempotente", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async () => {
  await withDatabase(validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test"), async (client, vectorAvailable) => {
    await applyUntil(client, vectorAvailable, (file) => file === SUGGESTIONS_MIGRATION);

    const project = randomUUID();
    const epic = randomUUID();
    await client.query("INSERT INTO projeto (id,nome,cliente,status) VALUES ($1,$2,'T','ativo')", [project, project]);
    await client.query("INSERT INTO epico (id,projeto_id,titulo) VALUES ($1,$2,'Épico legado')", [epic, project]);

    await applyUntil(client, vectorAvailable, () => false);

    const epicRow = (await client.query("SELECT titulo, provenance_json FROM epico WHERE id=$1", [epic])).rows[0];
    assert.equal(epicRow.titulo, "Épico legado", "linhas legadas são preservadas");
    assert.deepEqual(epicRow.provenance_json, {}, "proveniência default é vazia, implicando human-authored");

    const columns = (await client.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('epico','feature','pbi') AND column_name='provenance_json'",
    )).rows.map((row) => row.table_name);
    assert.deepEqual(columns.sort(), ["epico", "feature", "pbi"]);

    const columnDefault = (await client.query(
      "SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name='pbi' AND column_name='provenance_json'",
    )).rows[0];
    assert.equal(columnDefault.is_nullable, "NO");

    const suggestion = randomUUID();
    await client.query(
      `INSERT INTO sugestao_ia (id, entidade_tipo, entidade_id, campo, valor_sugerido) VALUES ($1,'epico',$2,'titulo','Novo título sugerido')`,
      [suggestion, epic],
    );
    await assert.rejects(
      client.query(`INSERT INTO sugestao_ia (entidade_tipo, entidade_id, campo, valor_sugerido) VALUES ('documento',$1,'titulo','x')`, [randomUUID()]),
      /ck_sugestao_ia_entidade_tipo/,
    );
    await assert.rejects(
      client.query(`INSERT INTO sugestao_ia (entidade_tipo, entidade_id, campo, valor_sugerido, status) VALUES ('epico',$1,'titulo','x','aceita')`, [randomUUID()]),
      /ck_sugestao_ia_resolucao/,
      "status resolvido exige resolvido_em/resolvido_por preenchidos",
    );
    await assert.rejects(
      client.query(
        `INSERT INTO sugestao_ia (entidade_tipo, entidade_id, campo, valor_sugerido) VALUES ('epico',$1,'titulo','duplicada')`,
        [epic],
      ),
      /uq_sugestao_ia_pendente/,
      "duas propostas pendentes para o mesmo campo violam o índice único parcial",
    );

    const migration = await loadMigration(SUGGESTIONS_MIGRATION, vectorAvailable);
    await client.query(migration);
    await client.query(migration);

    assert.equal((await client.query("SELECT count(*)::int AS n FROM sugestao_ia")).rows[0].n, 1, "reaplicar a migração não duplica ou remove linhas");
    const indexes = (await client.query("SELECT indexname FROM pg_indexes WHERE tablename='sugestao_ia'")).rows.map((row) => row.indexname);
    assert.ok(indexes.includes("uq_sugestao_ia_pendente"));
    assert.ok(indexes.includes("idx_sugestao_ia_entidade"));
  });
});
