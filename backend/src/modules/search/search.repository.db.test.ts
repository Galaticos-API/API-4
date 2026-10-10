import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { SearchRepository } from "./search.repository.js";

const databaseUrl = process.env.HYBRID_SEARCH_TEST_DATABASE_URL;

test("S2-06: busca híbrida aplica escopo antes da fusão e combina filtros no PostgreSQL", { skip: !databaseUrl }, async () => {
  const db = new Pool({ max: 1, connectionString: validateTarget(databaseUrl, "test") });
  const schema = `hybrid_search_${randomUUID().replaceAll("-", "")}`;
  const migration = await readFile(resolve(process.cwd(), "../database/migrations/014_hybrid_search.sql"), "utf8");
  const projectA = randomUUID();
  const projectB = randomUUID();
  const documentA = randomUUID();
  const documentB = randomUUID();
  const documentC = randomUUID();
  const chunkA = randomUUID();
  const chunkB = randomUUID();
  const chunkC = randomUUID();
  const technologyId = randomUUID();
  const vector = Array.from({ length: 1024 }, (_, index) => index === 0 ? 1 : 0);
  const vectorLiteral = `[${vector.join(",")}]`;

  try {
    await db.query("CREATE EXTENSION IF NOT EXISTS vector");
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`SET search_path TO ${schema}, public`);
    await db.query("CREATE TABLE projeto (id uuid PRIMARY KEY, nome text NOT NULL)");
    await db.query("CREATE TABLE documento (id uuid PRIMARY KEY, nome text NOT NULL)");
    await db.query("CREATE TABLE decisao (id uuid PRIMARY KEY, titulo text, entidade_tipo text, entidade_id uuid)");
    await db.query("CREATE TABLE epico (id uuid PRIMARY KEY, titulo text)");
    await db.query("CREATE TABLE feature (id uuid PRIMARY KEY, titulo text, epico_id uuid)");
    await db.query("CREATE TABLE pbi (id uuid PRIMARY KEY, titulo text, feature_id uuid)");
    await db.query("CREATE TABLE tecnologia (id uuid PRIMARY KEY, nome text)");
    await db.query("CREATE TABLE entidade_tecnologia (id uuid PRIMARY KEY, entidade_tipo text NOT NULL, entidade_id uuid NOT NULL, tecnologia_id uuid NOT NULL)");
    await db.query("CREATE TABLE chunk (id uuid PRIMARY KEY, projeto_id uuid NOT NULL, entidade_tipo text NOT NULL, entidade_id uuid NOT NULL, texto text NOT NULL, metadados_json jsonb DEFAULT '{}'::jsonb, embedding vector(1024))");
    await db.query(migration);
    await db.query(migration);
    const index = await db.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'chunk' AND indexname = 'idx_chunk_text_search_portuguese'",
      [schema],
    );
    assert.equal(index.rowCount, 1, "a migration cria o índice textual e pode ser repetida");
    await db.query("INSERT INTO projeto VALUES ($1,'Projeto A'),($2,'Projeto B')", [projectA, projectB]);
    await db.query("INSERT INTO documento VALUES ($1,'Acesso'),($2,'Outro projeto'),($3,'Documento sem nível')", [documentA, documentB, documentC]);
    await db.query("INSERT INTO tecnologia VALUES ($1,'Autenticação')", [technologyId]);
    await db.query("INSERT INTO entidade_tecnologia VALUES ($1,'documento',$2,$3)", [randomUUID(), documentA, technologyId]);
    await db.query(
      `INSERT INTO chunk (id,projeto_id,entidade_tipo,entidade_id,texto,metadados_json,embedding) VALUES
       ($1,$2,'documento',$3,'Acesso administrativo ao portal e controle de permissões','{"source_locator":"GRF-01"}',$4::vector),
       ($5,$6,'documento',$7,'login de cliente; conteúdo confidencial externo','{"source_locator":"GRF-08"}',$4::vector),
       ($8,$2,'documento',$9,'Registro de uma decisão de arquitetura','{"tecnologias_ids":[]}',NULL)`,
      [chunkA, projectA, documentA, vectorLiteral, chunkB, projectB, documentB, chunkC, documentC],
    );

    const repository = new SearchRepository(db);
    assert.equal(await repository.projectExists(projectA), true);
    const input = { query: "login de cliente", projectId: projectA, limit: 10 };
    const scoped = await repository.hybridSearch(input, vector, 0.3);
    assert.deepEqual(scoped.map((row) => row.id), [chunkA], "resultado semântico é limitado ao projeto A");
    assert.equal(scoped[0].project_id, projectA);
    assert.equal(scoped[0].source_url, `/projects/${projectA}/documents`, "resultado de documento leva à aba do documento de origem");

    const tagged = await repository.hybridSearch({ ...input, technologyId }, vector, 0.3);
    assert.deepEqual(tagged.map((row) => row.id), [chunkA], "filtro de tecnologia funciona junto com o escopo de projeto");

    const combined = await repository.hybridSearch({ ...input, technologyId, level: "documento" }, vector, 0.3);
    assert.deepEqual(combined.map((row) => row.id), [chunkA], "tecnologia, nível e projeto são intersectados");

    const wrongTechnology = await repository.hybridSearch({ ...input, technologyId: randomUUID() }, vector, 0.3);
    assert.deepEqual(wrongTechnology, []);

    const wrongLevel = await repository.hybridSearch({ ...input, level: "pbi" }, vector, 0.3);
    assert.deepEqual(wrongLevel, []);

    const exactIdentifier = await repository.hybridSearch({ ...input, query: "GRF-01" }, vector, 0.3);
    assert.deepEqual(exactIdentifier.map((row) => row.id), [chunkA], "o localizador exato é pesquisável e continua limitado ao projeto");
    const lowercaseIdentifier = await repository.hybridSearch({ ...input, query: "grf-01" }, vector, 0.3);
    assert.deepEqual(lowercaseIdentifier.map((row) => row.id), [chunkA], "identificadores existentes não diferenciam maiúsculas de minúsculas");
    const missingLowercaseIdentifier = await repository.hybridSearch({ ...input, query: "grf-99" }, vector, 0.3);
    assert.deepEqual(missingLowercaseIdentifier, [], "identificador inexistente em minúsculas não cai no ranking semântico");
    const exactIdentifierOtherProject = await repository.hybridSearch({ ...input, query: "GRF-08", projectId: projectA }, vector, 0.3);
    assert.deepEqual(exactIdentifierOtherProject, [], "localizador de outro projeto não vaza por sinal lexical exato");
  } finally {
    await db.query("RESET search_path").catch(() => undefined);
    await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
    await db.end();
  }
});
