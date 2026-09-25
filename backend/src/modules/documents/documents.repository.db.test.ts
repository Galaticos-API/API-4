import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { ArchiveConflict } from "../projects/archive.types.js";
import { lockHierarchy } from "../projects/hierarchy-archive.js";
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
      assert.deepEqual((await repo.listByProject(project, null, 20)).items.map((item) => item.id), [plain]);
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

    await t.test("outbox: lease impede entrega dupla, falha aplica backoff e publicado sai da fila", async () => {
      const key = removalEventKey(indexed);
      const has = async () => (await repo.listPendingEvents(50)).some((item) => item.chave_idempotencia === key);
      const state = async () => (await pool.query("SELECT status, tentativas, last_error, next_attempt_at > CURRENT_TIMESTAMP AS adiado FROM evento_integracao WHERE chave_idempotencia=$1", [key])).rows[0];

      assert.equal(await has(), true, "evento pendente deve ser reservado");
      assert.equal(await has(), false, "evento reservado não pode ser entregue a outra instância");

      await repo.markEventFailed(key);
      const failed = await state();
      assert.equal(failed.status, "falha");
      assert.equal(failed.tentativas, 1);
      assert.equal(failed.adiado, true);
      assert.equal(failed.last_error, "Falha ao entregar evento ao consumidor configurado.");
      assert.equal(await has(), false, "backoff deve ocultar o evento até a próxima tentativa");

      await pool.query("UPDATE evento_integracao SET next_attempt_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE chave_idempotencia=$1", [key]);
      assert.equal(await has(), true, "evento vencido volta para a fila");

      await pool.query("UPDATE evento_integracao SET locked_until = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE chave_idempotencia=$1", [key]);
      assert.equal(await has(), true, "lease expirado permite nova reserva");

      await repo.markEventPublished(key);
      await pool.query("UPDATE evento_integracao SET next_attempt_at = CURRENT_TIMESTAMP - INTERVAL '1 second', locked_until = NULL WHERE chave_idempotencia=$1", [key]);
      assert.equal(await has(), false, "evento publicado nunca volta para a fila");
      assert.equal((await state()).status, "publicado");
    });

    await t.test("outbox: duas instâncias reservam eventos disjuntos", async () => {
      const keys = Array.from({ length: 6 }, () => `document.removed:${randomUUID()}`);
      try {
        for (const key of keys) {
          await pool.query("INSERT INTO evento_integracao (tipo, chave_idempotencia, payload) VALUES ('document.removed', $1, '{}'::jsonb)", [key]);
        }
        const otherPool = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
        const other = new DocumentsRepository(otherPool);
        const [a, b] = await Promise.all([repo.listPendingEvents(3), other.listPendingEvents(3)]);
        const ours = new Set(keys);
        const first = a.map((item) => item.chave_idempotencia).filter((key) => ours.has(key));
        const second = b.map((item) => item.chave_idempotencia).filter((key) => ours.has(key));
        assert.equal(first.filter((key) => second.includes(key)).length, 0);
        assert.ok(first.length + second.length <= keys.length);
        await otherPool.end();
      } finally {
        await pool.query("DELETE FROM evento_integracao WHERE chave_idempotencia = ANY($1::text[])", [keys]);
      }
    });

    await t.test("armazenamento: operações duráveis são reservadas, reagendadas e concluídas", async () => {
      const documentId = randomUUID();
      await repo.create({
        id: documentId, projetoId: project, nome: "fila.txt", extensao: ".txt", mime: "text/plain",
        tamanhoBytes: 4, caminho: `${project}/${documentId}`, usuarioId: user,
      });
      const mine = async () => (await repo.listPendingStorageOperations(100)).filter((item) => item.documento_id === documentId);
      const first = await mine();
      assert.equal(first.length, 1);
      assert.equal(first[0].acao, "finalizar_upload");
      assert.equal((await mine()).length, 0, "operação reservada não é entregue de novo");

      await repo.markStorageOperationFailed(first[0].id);
      assert.equal((await mine()).length, 0, "backoff oculta a operação");
      await pool.query("UPDATE documento_operacao_armazenamento SET next_attempt_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id=$1", [first[0].id]);
      const retry = await mine();
      assert.equal(retry.length, 1);

      await repo.completeStorageOperation(retry[0].id);
      await pool.query("UPDATE documento_operacao_armazenamento SET next_attempt_at = CURRENT_TIMESTAMP - INTERVAL '1 second', locked_until = NULL WHERE id=$1", [first[0].id]);
      assert.equal((await mine()).length, 0);
      assert.equal((await repo.listByProject(project, null, 50)).items.find((item) => item.id === documentId)?.armazenamento_pendente, false);
    });

    await t.test("paginação por cursor é estável, sem repetição e isolada por projeto", async () => {
      const paged = randomUUID();
      const ids: string[] = [];
      await pool.query("INSERT INTO projeto (id,nome,cliente,status) VALUES ($1::uuid,$1::text,'Teste','ativo')", [paged]);
      for (let index = 0; index < 5; index += 1) {
        const id = randomUUID();
        ids.push(id);
        await pool.query(
          "INSERT INTO documento (id,projeto_id,nome,extensao,mime,tamanho_bytes,caminho,usuario_id,created_at) VALUES ($1,$2,$3,'.txt','text/plain',1,$4,$5,'2026-01-01T00:00:00Z')",
          [id, paged, `doc-${index}.txt`, `${paged}/${id}`, user],
        );
      }
      const seen: string[] = [];
      let cursor: { createdAt: string; id: string } | null = null;
      for (let guard = 0; guard < 10; guard += 1) {
        const page = await repo.listByProject(paged, cursor, 2);
        seen.push(...page.items.map((item) => item.id));
        if (!page.hasMore) break;
        const last = page.items[page.items.length - 1];
        cursor = { createdAt: last.created_at, id: last.id };
      }
      assert.equal(new Set(seen).size, 5);
      assert.deepEqual([...seen].sort(), [...ids].sort());
      assert.ok(seen.every((id) => ids.includes(id)), "nenhum documento de outro projeto");
      const expected = [...ids].sort().reverse();
      assert.deepEqual(seen, expected, "ordem estável por created_at desc e id desc mesmo com datas iguais");
      await pool.query("DELETE FROM documento WHERE projeto_id=$1", [paged]);
      await pool.query("DELETE FROM projeto WHERE id=$1", [paged]);
    });

    await t.test("estatísticas de manutenção contam eventos e operações pendentes", async () => {
      const key = `document.removed:${randomUUID()}`;
      const before = await repo.maintenanceStats();
      await pool.query("INSERT INTO evento_integracao (tipo, chave_idempotencia, payload, created_at) VALUES ('document.removed', $1, '{}'::jsonb, CURRENT_TIMESTAMP - INTERVAL '2 hours')", [key]);
      try {
        const after = await repo.maintenanceStats();
        assert.equal(after.eventos_pendentes, before.eventos_pendentes + 1);
        assert.ok(after.evento_mais_antigo_segundos >= 7200);
        assert.equal(typeof after.operacoes_armazenamento_pendentes, "number");
      } finally {
        await pool.query("DELETE FROM evento_integracao WHERE chave_idempotencia=$1", [key]);
      }
    });

    await t.test("corrida arquivamento/upload: o escritor aguarda o lock e recebe conflito", async () => {
      const archivedProject = randomUUID();
      const attemptedDocument = randomUUID();
      await pool.query("INSERT INTO projeto (id,nome,cliente,status) VALUES ($1::uuid,$1::text,'Teste','ativo')", [archivedProject]);
      const archiver = await pool.connect();
      try {
        await archiver.query("BEGIN");
        await lockHierarchy(archiver);
        await archiver.query("UPDATE projeto SET status='arquivado' WHERE id=$1", [archivedProject]);
        const write = repo.create({
          id: attemptedDocument,
          projetoId: archivedProject,
          nome: "corrida.txt",
          extensao: ".txt",
          mime: "text/plain",
          tamanhoBytes: 8,
          caminho: `${archivedProject}/${attemptedDocument}`,
          usuarioId: user,
        });
        const deadline = Date.now() + 2_000;
        let waiting = false;
        while (!waiting && Date.now() < deadline) {
          const result = await pool.query<{ waiting: boolean }>(
            "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'LOCK TABLE projeto,%') AS waiting",
          );
          waiting = result.rows[0].waiting;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(waiting, true, "a gravação deve aguardar o lock do arquivamento");
        await archiver.query("COMMIT");
        await assert.rejects(write, ArchiveConflict);
        assert.equal((await pool.query("SELECT count(*)::int AS total FROM documento WHERE id=$1", [attemptedDocument])).rows[0].total, 0);
      } catch (error) {
        await archiver.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        archiver.release();
      }
    });

    await t.test("corrida arquivamento/DELETE: conflito preserva documento, chunks e auditoria", async () => {
      const archivedProject = randomUUID();
      const archivedDocument = randomUUID();
      const archivedChunk = randomUUID();
      await pool.query("INSERT INTO projeto (id,nome,cliente,status) VALUES ($1::uuid,$1::text,'Teste','ativo')", [archivedProject]);
      await repo.create({
        id: archivedDocument,
        projetoId: archivedProject,
        nome: "protegido.txt",
        extensao: ".txt",
        mime: "text/plain",
        tamanhoBytes: 8,
        caminho: `${archivedProject}/${archivedDocument}`,
        usuarioId: user,
      });
      await pool.query("INSERT INTO chunk (id,projeto_id,entidade_tipo,entidade_id,texto) VALUES ($1,$2,'documento',$3,'protegido')", [archivedChunk, archivedProject, archivedDocument]);

      const archiver = await pool.connect();
      try {
        await archiver.query("BEGIN");
        await lockHierarchy(archiver);
        await archiver.query("UPDATE projeto SET status='arquivado' WHERE id=$1", [archivedProject]);
        const removal = repo.remove({ id: archivedDocument, projetoId: archivedProject, usuarioId: user });
        const deadline = Date.now() + 2_000;
        let waiting = false;
        while (!waiting && Date.now() < deadline) {
          const result = await pool.query<{ waiting: boolean }>(
            "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'LOCK TABLE projeto,%') AS waiting",
          );
          waiting = result.rows[0].waiting;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(waiting, true, "a remoção deve aguardar o lock do arquivamento");
        await archiver.query("COMMIT");
        await assert.rejects(removal, ArchiveConflict);
        assert.equal((await repo.findById(archivedProject, archivedDocument))?.id, archivedDocument);
        assert.equal((await pool.query("SELECT count(*)::int AS total FROM chunk WHERE id=$1", [archivedChunk])).rows[0].total, 1);
        assert.equal((await pool.query("SELECT count(*)::int AS total FROM auditoria WHERE entidade_id=$1 AND acao='REMOVER_DOCUMENTO'", [archivedDocument])).rows[0].total, 0);
      } catch (error) {
        await archiver.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        archiver.release();
      }
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
