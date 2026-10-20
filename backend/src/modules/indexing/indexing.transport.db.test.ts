import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { IndexingRepository } from "./indexing.repository.js";
import { IndexingWorker } from "./indexing.worker.js";

test("S2-03: respostas inválidas e erros HTTP não gravam trechos e permitem recuperação", {
  skip: !process.env.INDEX_TEST_DATABASE_URL,
}, async t => {
  const db = new Pool({ connectionString: validateTarget(process.env.INDEX_TEST_DATABASE_URL, "test") });
  const repository = new IndexingRepository(db);
  const [project, epic] = [randomUUID(), randomUUID()];
  let mode = "ok";
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (mode.startsWith("http-")) {
      res.statusCode = Number(mode.slice(5));
      res.end(JSON.stringify({ message: "Não deve ser persistido: segredo" }));
      return;
    }
    const response = {
      entity_type: mode === "wrong-type" ? "pbi" : "epico",
      content: mode === "empty" ? "" : "Conteúdo sintético",
      metadata: { project_id: mode === "wrong-project" ? randomUUID() : project },
      embedding: mode === "short-vector" ? [1] : Array(1024).fill(mode === "zero-vector" ? 0 : 0.1),
    };
    res.end(mode === "invalid-json" ? "{" : JSON.stringify(response));
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const worker = new IndexingWorker(repository, "http://127.0.0.1:" + (server.address() as { port: number }).port);
  const state = async () => (await db.query("SELECT status,erro_codigo,evento_id FROM indice_evento WHERE projeto_id=$1", [project])).rows[0];
  try {
    await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES($1,$1::uuid::text,'Transporte','ativo')", [project]);
    await db.query("INSERT INTO epico(id,projeto_id,titulo,status) VALUES($1,$2,'Consultar acervo','concluido')", [epic, project]);
    for (const scenario of ["empty", "short-vector", "zero-vector", "invalid-json", "wrong-type", "wrong-project", "http-401", "http-429", "http-503"]) {
      await t.test(scenario, async () => {
        mode = scenario;
        await repository.retry(project, (await state()).evento_id);
        await worker.tick(project);
        const failed = await state();
        assert.equal(failed.status, "falha");
        const expected = scenario.startsWith("http-") ? "SERVICE_HTTP_ERROR"
          : scenario.startsWith("wrong-") ? "INVALID_SCOPE" : "INVALID_RESPONSE";
        assert.equal(failed.erro_codigo, expected);
        assert.equal((await db.query("SELECT count(*)::int n FROM chunk WHERE projeto_id=$1", [project])).rows[0].n, 0);
        assert.doesNotMatch(JSON.stringify(await repository.list(project)), /segredo/);
      });
    }
    mode = "ok";
    await repository.retry(project, (await state()).evento_id);
    await worker.tick(project);
    assert.equal((await state()).status, "processado");
    assert.equal((await state()).erro_codigo, null);
    assert.equal((await db.query("SELECT count(*)::int n FROM chunk WHERE projeto_id=$1", [project])).rows[0].n, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r()));
    await db.query("DELETE FROM projeto WHERE id=$1", [project]);
    await db.end();
  }
});
