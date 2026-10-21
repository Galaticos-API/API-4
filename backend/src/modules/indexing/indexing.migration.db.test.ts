import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyUntil, withDatabase } from "../../database/migration-test-utils.js";
import { validateTarget } from "../../database/seed-lib.js";

test("S2-03: migration 019 atualiza banco existente e não republica ao reaplicar", {
  skip: !process.env.INDEX_TEST_DATABASE_URL,
}, async () => {
  const adminUrl = validateTarget(process.env.INDEX_TEST_DATABASE_URL, "test");
  await withDatabase(adminUrl, async (client, vectorAvailable) => {
    assert.ok(vectorAvailable);
    await applyUntil(client, true, file => file.startsWith("019_"));
    const [project, archivedProject, epic, archivedEpic, nestedEpic, decision, archivedDecision] = Array.from({ length: 7 }, () => randomUUID());
    await client.query("INSERT INTO projeto(id,nome,cliente,status) VALUES($1::uuid,$1::text,'Migração','ativo'),($2::uuid,$2::text,'Migração','arquivado')", [project, archivedProject]);
    await client.query("INSERT INTO epico(id,projeto_id,titulo,status) VALUES($1,$4,'Ativo','concluido'),($2,$4,'Arquivado','arquivado'),($3,$5,'Ancestral arquivado','concluido')", [epic, archivedEpic, nestedEpic, project, archivedProject]);
    await client.query("INSERT INTO decisao(id,entidade_tipo,entidade_id,titulo,contexto,decisao,justificativa) VALUES($1,'projeto',$3,'Ativa','Contexto','Fila','Recuperação'),($2,'epico',$4,'Arquivada','Contexto','Fila','Recuperação')", [decision, archivedDecision, project, archivedEpic]);
    for (const [kind, id, projectId] of [
      ["epico", epic, project], ["epico", epic, project],
      ["epico", archivedEpic, project], ["decisao", decision, project],
      ["decisao", archivedDecision, project], ["epico", nestedEpic, archivedProject],
    ]) {
      await client.query("INSERT INTO chunk(projeto_id,entidade_tipo,entidade_id,texto) VALUES($1,$2,$3,'Legado')", [projectId, kind, id]);
    }
    await applyUntil(client, true, () => false);
    const events = (await client.query("SELECT projeto_id,entidade_id,status,evento_id FROM indice_evento ORDER BY entidade_id")).rows;
    assert.equal(events.length, 2);
    assert.deepEqual(new Set(events.map(row => row.entidade_id)), new Set([epic, decision]));
    assert.ok(events.every(row => row.projeto_id === project && row.status === "pendente"));
    assert.equal((await client.query("SELECT count(*)::int n FROM chunk")).rows[0].n, 0);
    await applyUntil(client, true, () => false);
    assert.deepEqual((await client.query("SELECT projeto_id,entidade_id,status,evento_id FROM indice_evento ORDER BY entidade_id")).rows, events);
    assert.equal((await client.query("SELECT count(*)::int n FROM decisao")).rows[0].n, 2);
    assert.equal((await client.query("SELECT count(*)::int n FROM epico")).rows[0].n, 3);
  });
});
