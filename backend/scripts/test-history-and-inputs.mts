import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { Client } from 'pg';
import { applyUntil } from '../src/database/migration-test-utils.js';

const name = 'sinapse-main-review-' + randomUUID().slice(0, 8);
const password = randomUUID();
const evidence: unknown[] = [];
const output = '../docs/qa/main-review-1261381/fourth-review/fix-validation';
const docker = (args: string[]) => {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Falha no Docker da auditoria.');
  return result.stdout.trim();
};
let started = false; let server: any; let db: any;
try {
  docker(['run', '-d', '--name', name, '-e', 'POSTGRES_USER=sinapse', '-e', 'POSTGRES_PASSWORD=' + password,
    '-e', 'POSTGRES_DB=sinapse_main_review_test', '-p', '127.0.0.1::5432', 'pgvector/pgvector:pg16']);
  started = true;
  const port = JSON.parse(docker(['inspect', name]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort;
  const url = `postgresql://sinapse:${password}@127.0.0.1:${port}/sinapse_main_review_test`;
  for (let n = 0; n < 40; n++) {
    if (spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'sinapse'], { encoding: 'utf8' }).status === 0) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const client = new Client({ connectionString: url }); await client.connect();
  try { await applyUntil(client, true, () => false); } finally { await client.end(); }
  process.env.DATABASE_URL = url; process.env.NODE_ENV = 'test';
  const [{ pool }, { app }, { SessionService }, { AuthRepository }, express, { SearchRepository }, { SearchService }, { createSearchRouter }, { errorHandler }] = await Promise.all([
    import('../src/database/db.js'), import('../src/app.js'), import('../src/modules/auth/session.service.js'), import('../src/modules/auth/auth.repository.js'),
    import('express'), import('../src/modules/search/search.repository.js'), import('../src/modules/search/search.service.js'), import('../src/modules/search/search.routes.js'), import('../src/middleware/errorHandler.js'),
  ]);
  db = pool;
  const admin = (await db.query("INSERT INTO usuario(nome,email,senha_hash,role) VALUES ('QA',$1,'unused','admin') RETURNING id", [randomUUID() + '@example.test'])).rows[0].id;
  const token = (await new SessionService(new AuthRepository(db)).createSession(admin)).token;
  const project = (await db.query("INSERT INTO projeto(nome,cliente,status) VALUES ('QA quarta revisão','QA','ativo') RETURNING id")).rows[0].id;
  const epic = (await db.query("INSERT INTO epico(projeto_id,titulo,status) VALUES ($1,'QA épico','rascunho') RETURNING id", [project])).rows[0].id;
  const feature = (await db.query("INSERT INTO feature(epico_id,titulo,status) VALUES ($1,'QA feature','rascunho') RETURNING id", [epic])).rows[0].id;
  const pbi = (await db.query("INSERT INTO pbi(feature_id,codigo,titulo,status,historia_como_um,historia_eu_quero,historia_para_que) VALUES ($1,'QA-FOURTH','QA PBI','rascunho','PO','Consultar','Validar') RETURNING id", [feature])).rows[0].id;
  const review = express.default();
  let embeddingCalls = 0;
  review.use('/qa-search', createSearchRouter(new SearchService(new SearchRepository(db), { async embed() { embeddingCalls++; return Array.from({ length: 1024 }, (_, i) => i === 0 ? 1 : 0); } })));
  review.use(app); review.use(errorHandler);
  server = review.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (path: string, body?: unknown, method = 'GET') => {
    const response = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    return { status: response.status, body: await response.json() };
  };

  // As datas compartilham o milissegundo; três registros também têm microssegundos iguais.
  await db.query("DELETE FROM auditoria WHERE entidade_tipo='epico' AND entidade_id=$1", [epic]);
  for (const fraction of ['000900', '000800', '000700', '000700', '000700']) await db.query("INSERT INTO auditoria(usuario_id,entidade_tipo,entidade_id,acao,dados_json,created_at) VALUES ($1,'epico',$2,'QA_AUDIT','{}',$3)", [admin, epic, '2026-10-25T12:00:00.' + fraction + 'Z']);
  const first = await request('/api/v1/audit/epico/' + epic + '/history?limit=1');
  assert.equal(first.status, 200); assert.ok(first.body.next_cursor);
  const second = await request('/api/v1/audit/epico/' + epic + '/history?limit=1&cursor=' + first.body.next_cursor);
  const count = (await db.query("SELECT count(*)::int AS total FROM auditoria WHERE entidade_tipo='epico' AND entidade_id=$1", [epic])).rows[0].total;
  assert.equal(count, 5); assert.equal(second.status, 200); assert.equal(second.body.items.length, 1);
  const ids = [first.body.items[0].id, second.body.items[0].id];
  let cursor = second.body.next_cursor;
  while (cursor) {
    const page = await request('/api/v1/audit/epico/' + epic + '/history?limit=1&cursor=' + cursor);
    assert.equal(page.status, 200); assert.equal(page.body.items.length, 1);
    ids.push(page.body.items[0].id); cursor = page.body.next_cursor;
    assert.ok(ids.length <= count);
  }
  assert.equal(new Set(ids).size, count);
  evidence.push({ case: 'audit_microseconds_and_equal_timestamps', count, unique_returned: new Set(ids).size });

  for (const [route, table, id] of [['epics', 'epico', epic], ['features', 'feature', feature], ['pbis', 'pbi', pbi]]) {
    const impact = await request('/api/v1/' + route + '/' + id + '/archive-impact'); assert.equal(impact.status, 200);
    for (const invalid of ['QA\u0000', 'QA\uD800']) {
      const result = await request('/api/v1/' + route + '/' + id + '/archive', { confirmado: true, impacto: impact.body, justificativa: invalid }, 'PATCH');
      const state = (await db.query('SELECT status FROM ' + table + ' WHERE id=$1', [id])).rows[0].status;
      assert.equal(result.status, 400); assert.equal(state, 'rascunho');
      evidence.push({ case: route + '_archive_invalid_justification', invalid: JSON.stringify(invalid), result, persisted_status: state });
    }
  }
  const chunk = (await db.query("INSERT INTO chunk(projeto_id,entidade_tipo,entidade_id,texto,metadados_json) VALUES ($1,'epico',$2,'QA evidência','{}') RETURNING id", [project, epic])).rows[0].id;
  for (const invalid of ['QA\u0000', 'QA\uD800']) {
    const result = await request('/api/v1/admin/projects/' + project + '/purge', { confirmacao_nome: 'QA quarta revisão', justificativa: invalid }, 'POST');
    const remains = (await db.query('SELECT 1 FROM chunk WHERE id=$1', [chunk])).rowCount;
    assert.equal(result.status, 400); assert.equal(remains, 1);
    evidence.push({ case: 'purge_invalid_justification', invalid: JSON.stringify(invalid), result, chunk_preserved_by_rollback: true });
  }
  const projectImpact = await request('/api/v1/projects/' + project + '/archive-impact'); assert.equal(projectImpact.status, 200);
  const projectArchive = await request('/api/v1/projects/' + project + '/archive', { confirmado: true, impacto: projectImpact.body, justificativa: 'QA\u0000' }, 'PATCH');
  assert.equal(projectArchive.status, 400);
  const projectState = (await db.query('SELECT status FROM projeto WHERE id=$1', [project])).rows[0].status;
  assert.equal(projectState, 'ativo');
  evidence.push({ case: 'project_archive_invalid_justification', result: projectArchive, persisted_status: projectState });
  const search = await request('/qa-search?projeto_id=' + project + '&q=Consulta%00');
  assert.equal(search.status, 400);
  evidence.push({ case: 'hybrid_search_query_nul', result: search, embedding: 'vetor controlado; rota, autorização e SQL reais' });
  const backlog = await request('/api/v1/projects/' + project + '/backlog-search?q=Consulta%00');
  assert.equal(backlog.status, 400);
  evidence.push({ case: 'backlog_search_query_nul', result: backlog });
  const projects = await request('/api/v1/projects?busca=Consulta%00');
  assert.equal(projects.status, 400);
  assert.equal(embeddingCalls, 0);
  evidence.push({ case: 'project_list_search_nul', result: projects });
  await mkdir(output, { recursive: true });
  for (const path of ['/api/v1/projects?busca=QA', '/api/v1/projects/' + project + '/backlog-search?q=QA', '/qa-search?projeto_id=' + project + '&q=Consulta']) {
    const result = await request(path); assert.equal(result.status, 200);
    evidence.push({ case: 'valid_search', path, status: result.status });
  }
  const purge = await request('/api/v1/admin/projects/' + project + '/purge', { confirmacao_nome: 'QA quarta revisão', justificativa: 'Motivo válido 🧪' }, 'POST');
  assert.equal(purge.status, 200); assert.equal((await db.query('SELECT 1 FROM chunk WHERE id=$1', [chunk])).rowCount, 0);
  for (const [route, id] of [['pbis', pbi], ['features', feature], ['epics', epic]]) {
    const impact = await request('/api/v1/' + route + '/' + id + '/archive-impact');
    assert.equal(impact.status, 200);
    const result = await request('/api/v1/' + route + '/' + id + '/archive', { confirmado: true, impacto: impact.body, justificativa: 'Motivo válido 🧪' }, 'PATCH');
    assert.equal(result.status, 200);
    evidence.push({ case: 'valid_archive_' + route, status: result.status });
  }
  const latestImpact = await request('/api/v1/projects/' + project + '/archive-impact');
  const validArchive = await request('/api/v1/projects/' + project + '/archive', { confirmado: true, impacto: latestImpact.body, justificativa: 'Arquivar após QA 🧪' }, 'PATCH');
  assert.equal(validArchive.status, 200);
  assert.equal((await db.query('SELECT status FROM projeto WHERE id=$1', [project])).rows[0].status, 'arquivado');
  await writeFile(output + '/database-evidence.json', JSON.stringify({ head: '1261381 + correções locais', timestamp: new Date().toISOString(), evidence, valid_purge: purge.status, valid_archive: validArchive.status }, null, 2));
  console.log('Regressões aprovadas:', evidence.length, 'casos e fluxos válidos de expurgo/arquivamento; banco descartável.');
} finally {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  if (db) await db.end();
  if (started) docker(['rm', '-f', name]);
}
