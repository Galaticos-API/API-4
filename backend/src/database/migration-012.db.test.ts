import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { validateTarget } from "./seed-lib.js";

const migrationsDir = resolve(process.cwd(), "../database/migrations");
const DOCUMENT_MIGRATION = "012_document_upload.sql";

async function migrationFiles(): Promise<string[]> {
  return (await readdir(migrationsDir)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
}

function connectionFor(adminUrl: string, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function loadMigration(file: string, vectorAvailable: boolean): Promise<string> {
  let sql = await readFile(join(migrationsDir, file), "utf8");
  sql = sql.replaceAll("\\ir ../init.sql", await readFile(join(migrationsDir, "../init.sql"), "utf8"));
  if (vectorAvailable) return sql;
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS vector;/g, "")
    .replace(/vector\(1024\)/g, "real[]")
    .replace(/^.*USING hnsw.*$/gm, "");
}

async function applyUntil(client: Client, vectorAvailable: boolean, stop: (file: string) => boolean): Promise<void> {
  await client.query("CREATE TABLE IF NOT EXISTS _schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  for (const file of await migrationFiles()) {
    if (stop(file)) return;
    const applied = await client.query("SELECT 1 FROM _schema_migrations WHERE version=$1", [file]);
    if (applied.rowCount) continue;
    await client.query(await loadMigration(file, vectorAvailable));
    await client.query("INSERT INTO _schema_migrations (version) VALUES ($1)", [file]);
  }
}

async function withDatabase(adminUrl: string, run: (client: Client, vectorAvailable: boolean) => Promise<void>): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const database = `migration012_${randomUUID().replaceAll("-", "").slice(0, 16)}_test`;
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

test("migrations: a 012 sucede a 011 e o runner usa nomes completos sem colisão", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async () => {
  const files = await migrationFiles();
  assert.equal(new Set(files).size, files.length);
  const index011 = files.indexOf("011_unique_entity_technology.sql");
  const index012 = files.indexOf(DOCUMENT_MIGRATION);
  assert.ok(index011 >= 0 && index012 > index011, "012 deve ser aplicada depois da 011");
  assert.equal(files.filter((file) => file.startsWith("012_")).length, 1);
});

test("migration 012 em banco limpo cria estruturas, índices e restrições", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async () => {
  await withDatabase(validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test"), async (client, vectorAvailable) => {
    await applyUntil(client, vectorAvailable, () => false);
    const columns = (await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='documento'")).rows.map((row) => row.column_name);
    for (const column of ["extensao", "tamanho_bytes", "usuario_id"]) assert.ok(columns.includes(column), column);
    const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map((row) => row.table_name);
    assert.ok(tables.includes("evento_integracao"));
    assert.ok(tables.includes("documento_operacao_armazenamento"));
    const indexes = (await client.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'")).rows.map((row) => row.indexname);
    for (const name of ["idx_documento_projeto_created", "idx_chunk_documento", "idx_evento_integracao_delivery", "idx_documento_storage_pending"]) {
      assert.ok(indexes.includes(name), name);
    }

    const project = randomUUID();
    const document = randomUUID();
    await client.query("INSERT INTO projeto (id,nome,cliente,status) VALUES ($1,'P012','Teste','ativo')", [project]);
    await assert.rejects(
      client.query("INSERT INTO documento (id,projeto_id,nome,caminho,tamanho_bytes) VALUES ($1,$2,'zero.txt','x',0)", [document, project]),
      /ck_documento_tamanho/,
    );
    await assert.rejects(
      client.query("INSERT INTO documento (id,projeto_id,nome,caminho,status_processamento) VALUES ($1,$2,'x.txt','x','inventado')", [document, project]),
      /ck_documento_status/,
    );
    await client.query("INSERT INTO evento_integracao (tipo,chave_idempotencia,payload) VALUES ('document.removed','k1','{}')");
    await assert.rejects(client.query("INSERT INTO evento_integracao (tipo,chave_idempotencia,payload) VALUES ('document.removed','k1','{}')"), /uq_evento_integracao_chave/);
    await assert.rejects(client.query("INSERT INTO evento_integracao (tipo,chave_idempotencia,payload,status) VALUES ('t','k2','{}','x')"), /ck_evento_integracao_status/);
    await client.query("INSERT INTO documento_operacao_armazenamento (documento_id,projeto_id,acao,caminho) VALUES ($1,$2,'finalizar_upload','a/b')", [document, project]);
    await assert.rejects(
      client.query("INSERT INTO documento_operacao_armazenamento (documento_id,projeto_id,acao,caminho) VALUES ($1,$2,'finalizar_upload','a/b')", [document, project]),
      /uq_documento_storage_action/,
    );
    await assert.rejects(
      client.query("INSERT INTO documento_operacao_armazenamento (documento_id,projeto_id,acao,caminho) VALUES ($1,$2,'apagar_tudo','a/b')", [document, project]),
    );
  });
});

test("migration 012 em banco existente na 011 preserva dados legados e é idempotente", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async () => {
  await withDatabase(validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test"), async (client, vectorAvailable) => {
    await applyUntil(client, vectorAvailable, (file) => file === DOCUMENT_MIGRATION);
    assert.equal((await client.query("SELECT 1 FROM _schema_migrations WHERE version='011_unique_entity_technology.sql'")).rowCount, 1);
    assert.equal((await client.query("SELECT 1 FROM _schema_migrations WHERE version=$1", [DOCUMENT_MIGRATION])).rowCount, 0);

    const project = randomUUID();
    const legacy = randomUUID();
    const chunk = randomUUID();
    await client.query("INSERT INTO projeto (id,nome,cliente,status) VALUES ($1,'Legado','Teste','ativo')", [project]);
    await client.query("INSERT INTO documento (id,projeto_id,nome,mime,caminho,status_processamento) VALUES ($1,$2,'legado.pdf','application/pdf','/legado/legado.pdf','processado')", [legacy, project]);
    await client.query("INSERT INTO chunk (id,projeto_id,entidade_tipo,entidade_id,texto) VALUES ($1,$2,'documento',$3,'trecho legado')", [chunk, project, legacy]);

    await applyUntil(client, vectorAvailable, () => false);
    const row = (await client.query("SELECT nome, mime, caminho, status_processamento, extensao, tamanho_bytes, usuario_id FROM documento WHERE id=$1", [legacy])).rows[0];
    assert.deepEqual(row, {
      nome: "legado.pdf", mime: "application/pdf", caminho: "/legado/legado.pdf", status_processamento: "processado",
      extensao: null, tamanho_bytes: null, usuario_id: null,
    });
    assert.equal((await client.query("SELECT count(*)::int AS n FROM chunk WHERE id=$1", [chunk])).rows[0].n, 1);

    const migration = await loadMigration(DOCUMENT_MIGRATION, vectorAvailable);
    await client.query(migration);
    await client.query(migration);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM documento WHERE id=$1", [legacy])).rows[0].n, 1);
    const versions = (await client.query("SELECT version FROM _schema_migrations ORDER BY version")).rows.map((item) => item.version);
    assert.deepEqual(versions, await migrationFiles());
  });
});
