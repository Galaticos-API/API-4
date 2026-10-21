import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { IndexingRepository } from "./indexing.repository.js";
import { IndexingWorker } from "./indexing.worker.js";
import { SearchRepository } from "../search/search.repository.js";

test("S2-03/S2-02: serviço IA real, embedding, substituição e arquivamento", {
  skip: !process.env.INDEX_TEST_DATABASE_URL || !process.env.INDEX_AI_ENDPOINT,
  timeout: 180000,
}, async () => {
  const db = new Pool({ connectionString: validateTarget(process.env.INDEX_TEST_DATABASE_URL, "test") });
  const [project, epic] = [randomUUID(), randomUUID()];
  const worker = new IndexingWorker(new IndexingRepository(db), process.env.INDEX_AI_ENDPOINT);
  const search = new SearchRepository(db);
  try {
    await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES($1,'Integração S2-03','Sintético','ativo')", [project]);
    await db.query("INSERT INTO epico(id,projeto_id,titulo,objetivo,status) VALUES($1,$2,'Consultar acervo sintético','Preservar requisitos de integração','concluido')", [epic, project]);
    await worker.tick(project);
    const state = async () => (await db.query("SELECT status,erro_codigo FROM indice_evento WHERE projeto_id=$1", [project])).rows[0];
    assert.equal((await state()).status, "processado", JSON.stringify(await state()));
    const original = (await db.query("SELECT id,texto,embedding::text FROM chunk WHERE projeto_id=$1", [project])).rows[0];
    assert.match(original.texto, /Preservar requisitos/);
    const embedding = JSON.parse(original.embedding) as number[];
    assert.equal(embedding.length, 1024);
    assert.ok(embedding.some(value => value !== 0));
    assert.equal((await search.hybridSearch({ projectId: project, query: "acervo", limit: 5 }, embedding, 0.5)).length, 1);
    await db.query("UPDATE epico SET objetivo='Consultar conhecimento atualizado de integração' WHERE id=$1", [epic]);
    await worker.tick(project);
    assert.equal((await state()).status, "processado");
    const revised = (await db.query("SELECT id,texto FROM chunk WHERE projeto_id=$1", [project])).rows;
    assert.equal(revised.length, 1);
    assert.equal(revised[0].id, original.id);
    assert.match(revised[0].texto, /conhecimento atualizado/);
    assert.doesNotMatch(revised[0].texto, /Preservar requisitos/);
    await db.query("UPDATE epico SET status='arquivado' WHERE id=$1", [epic]);
    assert.equal((await search.hybridSearch({ projectId: project, query: "acervo", limit: 5 }, embedding, 0.5)).length, 0);
    console.log("IA real: vetor 1024d, busca, substituição sem duplicação e retirada imediata ao arquivar.");
  } finally {
    await db.query("DELETE FROM projeto WHERE id=$1", [project]);
    await db.end();
  }
});
