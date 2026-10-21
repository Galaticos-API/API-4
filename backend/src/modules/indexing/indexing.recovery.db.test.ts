import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";
import { IndexingRepository } from "./indexing.repository.js";

async function fixture() {
  const db = new Pool({ connectionString: validateTarget(process.env.INDEX_TEST_DATABASE_URL, "test") });
  const repository = new IndexingRepository(db);
  const [project, other, epic, otherEpic] = Array.from({ length: 4 }, () => randomUUID());
  await db.query("INSERT INTO projeto(id,nome,cliente,status) VALUES($1::uuid,'Relógio '||$1::text,'Teste','ativo'),($2::uuid,'Outro '||$2::text,'Teste','ativo')", [project, other]);
  await db.query("INSERT INTO epico(id,projeto_id,titulo,status) VALUES($1,$2,'Épico','concluido'),($3,$4,'Outro','concluido')", [epic, project, otherEpic, other]);
  async function close() {
    await db.query("DELETE FROM projeto WHERE id=ANY($1::uuid[])", [[project, other]]);
    await db.end();
  }
  return { db, repository, project, other, epic, close };
}

test("S2-03: diferença no relógio do backend não libera uma reserva ativa", {
  skip: !process.env.INDEX_TEST_DATABASE_URL,
}, async () => {
  const { db, repository, project, close } = await fixture();
  const now = Date.now;
  try {
    const event = (await repository.claim(project))!;
    Date.now = () => now() + 10 * 60 * 1000;
    await assert.rejects(repository.retry(project, event.evento_id), /em processamento/);
    assert.equal((await db.query("SELECT status FROM indice_evento WHERE evento_id=$1", [event.evento_id])).rows[0].status, "processando");
  } finally {
    Date.now = now;
    await close();
  }
});

test("S2-03: claim de um projeto não altera reservas expiradas de outro", {
  skip: !process.env.INDEX_TEST_DATABASE_URL,
}, async () => {
  const { db, repository, project, other, close } = await fixture();
  try {
    const event = (await repository.claim(other))!;
    await db.query("UPDATE indice_evento SET tentativas=5,bloqueado_ate=clock_timestamp()-INTERVAL '1 second' WHERE evento_id=$1", [event.evento_id]);
    await repository.claim(project);
    assert.equal((await db.query("SELECT status FROM indice_evento WHERE evento_id=$1", [event.evento_id])).rows[0].status, "processando");
    await repository.claim(other);
    assert.equal((await db.query("SELECT erro_codigo FROM indice_evento WHERE evento_id=$1", [event.evento_id])).rows[0].erro_codigo, "ATTEMPTS_EXHAUSTED");
  } finally { await close(); }
});

test("S2-03: mover origem entre projetos remove índice antigo e descarta resposta atrasada", {
  skip: !process.env.INDEX_TEST_DATABASE_URL,
}, async () => {
  const { db, repository, project, other, epic, close } = await fixture();
  const prepared = { content: "Conteúdo sintético", embedding: Array(1024).fill(0.1) };
  try {
    const initial = (await repository.claim(project))!;
    await repository.finish(initial, prepared);
    await repository.retry(project, initial.evento_id);
    const stale = (await repository.claim(project))!;
    await db.query("UPDATE epico SET projeto_id=$1 WHERE id=$2", [other, epic]);
    assert.equal((await db.query("SELECT count(*)::int n FROM chunk WHERE projeto_id=$1", [project])).rows[0].n, 0);
    await repository.finish(stale, prepared);
    assert.equal((await db.query("SELECT count(*)::int n FROM chunk WHERE projeto_id=$1", [project])).rows[0].n, 0);
    await repository.finish((await repository.claim(other))!, prepared);
    await repository.finish((await repository.claim(other))!, prepared);
    const moved = (await db.query("SELECT projeto_id,metadados_json FROM chunk WHERE entidade_id=$1", [epic])).rows;
    assert.equal(moved.length, 1);
    assert.equal(moved[0].projeto_id, other);
    assert.equal(moved[0].metadados_json.project_id, other);
  } finally { await close(); }
});


test("S2-03: workers concorrentes reservam eventos distintos e não duplicam uma origem", {
  skip: !process.env.INDEX_TEST_DATABASE_URL,
}, async () => {
  const { db, repository, project, close } = await fixture();
  try {
    const firstWave = await Promise.all([repository.claim(project), repository.claim(project)]);
    assert.equal(firstWave.filter(Boolean).length, 1);
    const first = firstWave.find(event => event !== null)!;
    await repository.finish(first, { content: "Concorrência", embedding: Array(1024).fill(0.1) });
    const ids = [randomUUID(), randomUUID()];
    await db.query("INSERT INTO epico(id,projeto_id,titulo,status) VALUES($1,$3,'Segundo','concluido'),($2,$3,'Terceiro','concluido')", [...ids, project]);
    const secondWave = await Promise.all([repository.claim(project), repository.claim(project)]);
    assert.ok(secondWave[0] && secondWave[1]);
    assert.notEqual(secondWave[0].evento_id, secondWave[1].evento_id);
    await Promise.all(secondWave.map(event => repository.finish(event!, { content: "Concorrência", embedding: Array(1024).fill(0.1) })));
    assert.equal((await db.query("SELECT count(*)::int n FROM chunk WHERE projeto_id=$1", [project])).rows[0].n, 3);
  } finally { await close(); }
});

test("S2-03: falha na gravação preserva o índice anterior e permite recuperação", {
  skip: !process.env.INDEX_TEST_DATABASE_URL,
}, async () => {
  const { db, repository, project, close } = await fixture();
  const prepared = { content: "Versão válida", embedding: Array(1024).fill(0.1) };
  try {
    const first = (await repository.claim(project))!;
    await repository.finish(first, prepared);
    const before = (await db.query("SELECT id,texto FROM chunk WHERE projeto_id=$1", [project])).rows;
    await repository.retry(project, first.evento_id);
    const retry = (await repository.claim(project))!;
    await assert.rejects(repository.finish(retry, { content: "Não deve persistir", embedding: [1] }));
    await repository.fail(retry, "PROCESSING_ERROR");
    assert.deepEqual((await db.query("SELECT id,texto FROM chunk WHERE projeto_id=$1", [project])).rows, before);
    assert.equal((await db.query("SELECT status FROM indice_evento WHERE evento_id=$1", [first.evento_id])).rows[0].status, "falha");
    await repository.retry(project, first.evento_id);
    await repository.finish((await repository.claim(project))!, prepared);
    assert.deepEqual((await db.query("SELECT id,texto FROM chunk WHERE projeto_id=$1", [project])).rows, before);
  } finally { await close(); }
});
