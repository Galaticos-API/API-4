import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { DocumentsRepository, removalEventKey } from "./documents.repository.js";

test("S1-19/S1-22: documentos, auditoria e outbox no PostgreSQL", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async (t) => {
  const pool = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const repo = new DocumentsRepository(pool);
  const [project, other, user, plain, indexed, chunk, foreign] = Array.from({ length: 7 }, () => randomUUID());
  const email = `${user}@documentos.test`;
  try {
    await pool.query("INSERT INTO usuario (id,nome,email,senha_hash,role) VALUES ($1,'Ana PO',$2,'hash','po')", [user, email]);
    await pool.query("INSERT INTO projeto (id,nome,cliente,status) VALUES ($1::uuid,$1::text,'Teste','ativo'),($2::uuid,$2::text,'Teste','ativo')", [project, other]);

    await t.test("cria documento com metadados, autor e auditoria sem conteúdo", async () => {
      const created = await repo.create({
        id: plain, projetoId: project, nome: "Escopo.pdf", extensao: ".pdf", mime: "application/pdf",
        tamanhoBytes: 1234, caminho: `${project}/${plain}`, usuarioId: user,
      });
      assert.equal(created.tamanho_bytes, 1234);
      assert.equal(created.autor_nome, "Ana PO");
      assert.equal(created.status_processamento, "pendente");
      const audit = (await pool.query("SELECT acao, dados_json FROM auditoria WHERE entidade_id=$1", [plain])).rows;
      assert.equal(audit.length, 1);
      assert.equal(audit[0].acao, "ENVIAR_DOCUMENTO");
      assert.deepEqual(Object.keys(audit[0].dados_json).sort(), ["extensao", "nome", "projeto_id", "tamanho_bytes"]);
    });

    await t.test("listagem e busca respeitam o isolamento por projeto", async () => {
      await repo.create({
        id: foreign, projetoId: other, nome: "Outro.txt", extensao: ".txt", mime: "text/plain",
        tamanhoBytes: 10, caminho: `${other}/${foreign}`, usuarioId: user,
      });
      assert.deepEqual((await repo.listByProject(project)).map((item) => item.id), [plain]);
      assert.equal(await repo.findById(project, foreign), null);
      assert.equal((await repo.findById(other, foreign))?.id, foreign);
    });

    await t.test("falha da auditoria desfaz a criação do registro", async () => {
      const orphan = randomUUID();
      await assert.rejects(repo.create({
        id: orphan, projetoId: project, nome: "x.txt", extensao: ".txt", mime: "text/plain",
        tamanhoBytes: 1, caminho: `${project}/${orphan}`, usuarioId: randomUUID(),
      }));
      assert.equal((await pool.query("SELECT count(*)::int n FROM documento WHERE id=$1", [orphan])).rows[0].n, 0);
    });

    await t.test("remove documento não indexado sem gerar evento e é idempotente", async () => {
      const result = await repo.remove({ id: plain, projetoId: project, usuarioId: user });
      assert.equal(result?.indexado, false);
      assert.equal(result?.eventoChave, null);
      assert.equal(await repo.remove({ id: plain, projetoId: project, usuarioId: user }), null);
      assert.equal((await pool.query("SELECT count(*)::int n FROM auditoria WHERE entidade_id=$1 AND acao='REMOVER_DOCUMENTO'", [plain])).rows[0].n, 1);
    });

    await t.test("remoção não atravessa projetos", async () => {
      assert.equal(await repo.remove({ id: foreign, projetoId: project, usuarioId: user }), null);
      assert.equal((await repo.findById(other, foreign))?.id, foreign);
    });

    await t.test("remove documento indexado, apaga chunks e grava um único evento com chave estável", async () => {
      await repo.create({
        id: indexed, projetoId: project, nome: "Indexado.md", extensao: ".md", mime: "text/markdown",
        tamanhoBytes: 50, caminho: `${project}/${indexed}`, usuarioId: user,
      });
      await pool.query("UPDATE documento SET status_processamento='processado' WHERE id=$1", [indexed]);
      await pool.query("INSERT INTO chunk (id,projeto_id,entidade_tipo,entidade_id,texto) VALUES ($1,$2,'documento',$3,'trecho')", [chunk, project, indexed]);

      const result = await repo.remove({ id: indexed, projetoId: project, usuarioId: user });
      assert.equal(result?.indexado, true);
      assert.equal(result?.chunksRemovidos, 1);
      assert.equal(result?.eventoChave, removalEventKey(indexed));
      assert.equal((await pool.query("SELECT count(*)::int n FROM chunk WHERE entidade_id=$1", [indexed])).rows[0].n, 0);

      assert.equal(await repo.remove({ id: indexed, projetoId: project, usuarioId: user }), null);
      const events = (await pool.query("SELECT status, payload FROM evento_integracao WHERE chave_idempotencia=$1", [removalEventKey(indexed)])).rows;
      assert.equal(events.length, 1);
      assert.equal(events[0].status, "pendente");
      assert.equal(events[0].payload.document_id, indexed);
      assert.equal(events[0].payload.project_id, project);
    });

    await t.test("outbox: pendente aparece na fila e some depois de publicado", async () => {
      const key = removalEventKey(indexed);
      assert.ok((await repo.listPendingEvents(50)).some((item) => item.chave_idempotencia === key));
      await repo.markEventFailed(key);
      assert.ok((await repo.listPendingEvents(50)).some((item) => item.chave_idempotencia === key));
      await repo.markEventPublished(key);
      assert.ok(!(await repo.listPendingEvents(50)).some((item) => item.chave_idempotencia === key));
    });
  } finally {
    await pool.query("DELETE FROM evento_integracao WHERE chave_idempotencia = ANY($1::text[])", [[removalEventKey(indexed), removalEventKey(plain)]]);
    await pool.query("DELETE FROM auditoria WHERE entidade_id = ANY($1::uuid[])", [[plain, indexed, foreign]]);
    await pool.query("DELETE FROM chunk WHERE id=$1", [chunk]);
    await pool.query("DELETE FROM projeto WHERE id = ANY($1::uuid[])", [[project, other]]);
    await pool.query("DELETE FROM usuario WHERE id=$1", [user]);
    await pool.end();
  }
});
