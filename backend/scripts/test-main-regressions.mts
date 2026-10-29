import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { Client } from 'pg';
import { applyUntil } from '../src/database/migration-test-utils.js';

// Regressões HTTP em PostgreSQL descartável, sem usar os dados de desenvolvimento.
const name = 'sinapse-main-review-' + randomUUID().slice(0, 8);
const password = randomUUID();
const evidence: Record<string, unknown>[] = [];
const output = '../docs/qa/main-review-1261381/fix-validation';
const docker = (args: string[]) => {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Falha no Docker da auditoria.');
  return result.stdout.trim();
};
let started = false;
let server: any;
let db: any;
try {
  docker(['run', '-d', '--name', name, '-e', 'POSTGRES_USER=sinapse', '-e', 'POSTGRES_PASSWORD=' + password,
    '-e', 'POSTGRES_DB=sinapse_main_review_test', '-p', '127.0.0.1::5432', 'pgvector/pgvector:pg16']);
  started = true;
  const port = JSON.parse(docker(['inspect', name]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort;
  const url = `postgresql://sinapse:${password}@127.0.0.1:${port}/sinapse_main_review_test`;
  for (let n = 0; n < 40; n++) {
    const ready = spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'sinapse'], { encoding: 'utf8' });
    if (ready.status === 0) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try { await applyUntil(client, true, () => false); } finally { await client.end(); }
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  const [{ pool }, { app }, express, { SessionService }, { AuthRepository }, { ProjectAccess }, { SearchRepository },
    { SearchService }, { createSearchRouter }, { createDocumentTextRouter, DocumentTextRepository },
    { createProjectAccessRouter }, { errorHandler }, { HarnessService }, { HarnessRepository },
    { ChatRepository }, { createHarnessRunRouter }] = await Promise.all([
    import('../src/database/db.js'), import('../src/app.js'), import('express'),
    import('../src/modules/auth/session.service.js'), import('../src/modules/auth/auth.repository.js'),
    import('../src/modules/projects/project-access.js'), import('../src/modules/search/search.repository.js'),
    import('../src/modules/search/search.service.js'), import('../src/modules/search/search.routes.js'),
    import('../src/modules/documents/documents.text.js'), import('../src/middleware/projectAccess.js'),
    import('../src/middleware/errorHandler.js'), import('../src/modules/harness/harness.service.js'),
    import('../src/modules/harness/harness.repository.js'), import('../src/modules/chat/chat.repository.js'),
    import('../src/modules/harness/harness.routes.js'),
  ]);
  db = pool;
  const user = async (role: string) => (await db.query("INSERT INTO usuario(nome,email,senha_hash,role) VALUES ('QA', $1, 'unused', $2) RETURNING id", [randomUUID() + '@example.test', role])).rows[0].id;
  const admin = await user('admin'); const dev = await user('dev');
  const sessions = new SessionService(new AuthRepository(db));
  const adminToken = (await sessions.createSession(admin)).token;
  const devToken = (await sessions.createSession(dev)).token;
  const project = (await db.query("INSERT INTO projeto(nome,cliente,status) VALUES ('QA privado','QA','ativo') RETURNING id")).rows[0].id;
  const developer = (await db.query('INSERT INTO desenvolvedor(usuario_id) VALUES ($1) RETURNING id', [dev])).rows[0].id;
  const allocate = () => db.query('INSERT INTO alocacao(desenvolvedor_id,projeto_id) VALUES ($1,$2)', [developer, project]);
  const revoke = () => db.query('DELETE FROM alocacao WHERE desenvolvedor_id=$1 AND projeto_id=$2', [developer, project]);
  await allocate();
  const document = (await db.query("INSERT INTO documento(projeto_id,nome,caminho,mime,status_processamento) VALUES ($1,'QA.txt','qa.txt','text/plain','processado') RETURNING id", [project])).rows[0].id;
  const vector = Array.from({ length: 1024 }, (_, i) => i === 0 ? 1 : 0);
  const chunk = (await db.query("INSERT INTO chunk(projeto_id,entidade_tipo,entidade_id,texto,embedding,metadados_json) VALUES ($1,'documento',$2,'Evidência confidencial sobre arquitetura Aurora.', $3::vector,'{}') RETURNING id", [project, document, '[' + vector.join(',') + ']'])).rows[0].id;
  const review = express.default();
  review.use(express.default.json());
  let deactivateDuringEmbedding = false;
  review.use('/qa-search', createSearchRouter(new SearchService(new SearchRepository(db), {
    async embed() {
      if (deactivateDuringEmbedding) await db.query('UPDATE usuario SET ativo=FALSE WHERE id=$1', [dev]);
      else await revoke();
      return vector;
    },
  }), undefined, new ProjectAccess(db)));
  review.use('/qa-doc', createProjectAccessRouter(new ProjectAccess(db)));
  const gatedPool = { async connect() { await revoke(); return db.connect(); } };
  review.use('/qa-doc/projects/:projectId/documents', createDocumentTextRouter(new DocumentTextRepository(gatedPool as any)));
  let sentContext: unknown;
  let archiveDuringGeneration = false;
  let unsupportedClaim = false;
  const harness = new HarnessService(new HarnessRepository(db), { async generate(payload: any) {
    sentContext = payload.context;
    if (archiveDuringGeneration) await db.query("UPDATE projeto SET status='arquivado',archived_at=CURRENT_TIMESTAMP WHERE id=$1", [project]);
    const evidence = payload.context.map((c: any) => ({ source_id: c.id, quote: unsupportedClaim ? 'O projeto utiliza COBOL em produção e possui 99 servidores.' : c.text }));
    // O contrato de evidências (2f70f6b) exige coverage coerente com a lista de citações.
    return { evidence, coverage: evidence.length ? 'complete' : 'no_evidence' };
  } }, new ChatRepository(db));
  review.use('/qa-harness', createProjectAccessRouter(new ProjectAccess(db)));
  review.use('/qa-harness/projects/:projectId/ai/requests', createHarnessRunRouter(harness));
  review.use(app);
  review.use(errorHandler);
  server = review.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (path: string, token = adminToken, body?: unknown, method = 'GET') => {
    const response = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    return { status: response.status, body: await response.json() };
  };
  const record = (name: string, result: unknown) => { evidence.push({ name, result }); console.log(name + ': ' + JSON.stringify(result)); };
  const listProject = (await db.query("INSERT INTO projeto(nome,cliente,status) VALUES ('QA listas','QA','ativo') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO epico(projeto_id,titulo,status) SELECT $1,'Épico ' || n,'rascunho' FROM generate_series(1,101) n", [listProject]);
  await db.query("INSERT INTO epico(projeto_id,titulo,status,archived_at) VALUES ($1,'Épico arquivado','arquivado',CURRENT_TIMESTAMP)", [listProject]);
  const defaultList = await request('/api/v1/epics?projeto_id=' + listProject + '&limit=100');
  const allList = await request('/api/v1/epics?projeto_id=' + listProject + '&limit=100&status=todos');
  const archivedList = await request('/api/v1/epics?projeto_id=' + listProject + '&limit=100&status=arquivado');
  record('epic_list_real_pagination_and_all_filter', { default: { status: defaultList.status, items: defaultList.body.items?.length, total: defaultList.body.total }, all: { status: allList.status, items: allList.body.items?.length, total: allList.body.total }, archived: { status: archivedList.status, total: archivedList.body.total } });
  assert.equal(defaultList.status, 200); assert.equal(defaultList.body.total, 101); assert.equal(defaultList.body.items.length, 100);
  assert.equal(allList.body.total, 102); assert.equal(archivedList.body.total, 1);
  const nextList = await request('/api/v1/epics?projeto_id=' + listProject + '&limit=100&offset=100');
  assert.equal(nextList.body.items.length, 1);
  assert.ok(!defaultList.body.items.some((item: any) => item.id === nextList.body.items[0].id));
  const cursor = defaultList.body.next_cursor;
  assert.equal(typeof cursor, 'string');
  await db.query("INSERT INTO epico(projeto_id,titulo,status) VALUES ($1,'Novo item entre páginas','rascunho')", [listProject]);
  const continuation = await request('/api/v1/epics?projeto_id=' + listProject + '&limit=100&before=' + cursor);
  assert.equal(continuation.status, 200); assert.equal(continuation.body.items.length, 1);
  assert.ok(!defaultList.body.items.some((item: any) => item.id === continuation.body.items[0].id));
  assert.equal((await request('/api/v1/epics?projeto_id=' + listProject + '&before=invalid')).status, 400);
  record('cursor_after_concurrent_insert', { status: continuation.status, duplicates: 0 });
  const parentEpic = defaultList.body.items[0].id;
  await db.query("INSERT INTO feature(epico_id,titulo,status,created_at) SELECT $1,'Feature '||n,'rascunho','2026-01-01T00:00:00.000123Z'::timestamptz FROM generate_series(1,101) n", [parentEpic]);
  let parentFeature: string | undefined;
  for (const kind of ['features', 'pbis']) {
    if (kind === 'pbis') await db.query("INSERT INTO pbi(feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que,status,created_at) SELECT $1,'QA-CURSOR-'||n,'PBI '||n,'PO','Testar','Validar','rascunho','2026-01-01T00:00:00.000123Z'::timestamptz FROM generate_series(1,101) n", [parentFeature]);
    const parent = kind === 'features' ? 'epico_id=' + parentEpic : 'feature_id=' + parentFeature;
    const firstPage = await request('/api/v1/' + kind + '?' + parent + '&limit=100');
    assert.equal(firstPage.status, 200); assert.equal(firstPage.body.items.length, 100);
    if (kind === 'features') parentFeature = firstPage.body.items[0].id;
    const anchor = firstPage.body.items.at(-1).id;
    if (kind === 'features') await db.query("INSERT INTO feature(epico_id,titulo,status) VALUES ($1,'Nova feature','rascunho')", [parentEpic]);
    else await db.query("INSERT INTO pbi(feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que,status) VALUES ($1,'QA-CURSOR-NEW','Novo PBI','PO','Testar','Validar','rascunho')", [parentFeature]);
    await db.query('DELETE FROM ' + (kind === 'features' ? 'feature' : 'pbi') + ' WHERE id=$1', [anchor]);
    const page = await request('/api/v1/' + kind + '?' + parent + '&limit=100&before=' + firstPage.body.next_cursor);
    assert.equal(page.status, 200); assert.equal(page.body.items.length, 1);
    assert.ok(!firstPage.body.items.some((item: any) => item.id === page.body.items[0].id));
    record(kind + '_cursor_insert_and_deleted_anchor', { status: page.status, duplicates: 0 });
  }
  const search = await request('/qa-search?q=arquitetura&projeto_id=' + project, devToken);
  record('search_after_access_revoked', { status: search.status, returned: search.body.items?.length, allocation_count: +(await db.query('SELECT count(*) FROM alocacao WHERE projeto_id=$1', [project])).rows[0].count });
  assert.equal(search.status, 404);
  assert.deepEqual(await new SearchRepository(db).hybridSearch({ projectId: project, query: 'arquitetura', limit: 10 }, vector, 0.55, 0.05, [project], dev), []);
  await allocate();
  deactivateDuringEmbedding = true;
  const deactivated = await request('/qa-search?q=arquitetura&projeto_id=' + project, devToken);
  assert.equal(deactivated.status, 404);
  record('search_account_deactivated_during_embedding', { status: deactivated.status });
  deactivateDuringEmbedding = false;
  await db.query('UPDATE usuario SET ativo=TRUE WHERE id=$1', [dev]);
  await revoke();
  await allocate();
  const excerpts = await request(`/qa-doc/projects/${project}/documents/${document}/excerpts?chunk_id=${chunk}`, devToken);
  record('excerpts_after_access_revoked', { status: excerpts.status, returned: excerpts.body.items?.length, allocation_count: +(await db.query('SELECT count(*) FROM alocacao WHERE projeto_id=$1', [project])).rows[0].count });
  assert.equal(excerpts.status, 404);
  await db.query("UPDATE projeto SET status='arquivado',archived_at=CURRENT_TIMESTAMP WHERE id=$1", [project]);
  const archived = await request(`/qa-harness/projects/${project}/ai/requests`, adminToken, { mode: 'consulta', operation: 'responder', level: 'pbi', fields: { pergunta: 'arquitetura Aurora' } }, 'POST');
  record('legacy_harness_archived_project', { status: archived.status, context: sentContext, result: archived.body.result });
  assert.equal(archived.status, 200); assert.deepEqual(sentContext, []);
  assert.deepEqual(archived.body.result.sources, []);
  await db.query("UPDATE projeto SET status='ativo',archived_at=NULL WHERE id=$1", [project]);
  archiveDuringGeneration = true;
  const changedContext = await request(`/qa-harness/projects/${project}/ai/requests`, adminToken, { mode: 'consulta', operation: 'responder', level: 'pbi', fields: { pergunta: 'arquitetura Aurora' } }, 'POST');
  assert.equal(changedContext.status, 503);
  record('harness_archived_during_generation', { status: changedContext.status });
  archiveDuringGeneration = false;
  record('canonical_search_archived_project', { returned: (await new SearchRepository(db).hybridSearch({ projectId: project, query: 'arquitetura', limit: 10 }, vector, 0.55)).length });
  await db.query("UPDATE projeto SET status='ativo',archived_at=NULL WHERE id=$1", [project]);
  unsupportedClaim = true;
  const rejectedClaim = await request(`/qa-harness/projects/${project}/ai/requests`, adminToken, { mode: 'consulta', operation: 'responder', level: 'pbi', fields: { pergunta: 'arquitetura Aurora' } }, 'POST');
  // Citação que não existe no trecho é descartada: a resposta vira "não encontrei", sem fonte nem o texto inventado.
  assert.equal(rejectedClaim.status, 200); assert.deepEqual(rejectedClaim.body.result.sources, []);
  assert.ok(!JSON.stringify(rejectedClaim.body).includes('COBOL'));
  record('unsupported_claim_rejected', { status: rejectedClaim.status, sources: rejectedClaim.body.result.sources });
  unsupportedClaim = false;
  const supportedClaim = await request(`/qa-harness/projects/${project}/ai/requests`, adminToken, { mode: 'consulta', operation: 'responder', level: 'pbi', fields: { pergunta: 'arquitetura Aurora' } }, 'POST');
  assert.equal(supportedClaim.status, 200); assert.deepEqual(supportedClaim.body.result.sources, [chunk]);
  const epic = defaultList.body.items[0].id;
  const proposalPath = '/api/v1/epics/' + epic + '/suggestions';
  const validProposal = await request(proposalPath, adminToken, { campo: 'descricao', valor_sugerido: 'Descrição válida' }, 'POST');
  assert.equal(validProposal.status, 201);
  for (const value of ['QA\u0000', 'QA\ud800']) {
    assert.equal((await request(proposalPath, adminToken, { campo: 'descricao', valor_sugerido: value }, 'POST')).status, 400);
    assert.equal((await request(proposalPath + '/' + validProposal.body.id + '/edit', adminToken, { valor: value }, 'POST')).status, 400);
    assert.equal((await request(proposalPath + '/' + validProposal.body.id + '/accept', adminToken, { justificativa: value }, 'POST')).status, 400);
  }
  assert.equal((await db.query('SELECT status FROM sugestao_ia WHERE id=$1', [validProposal.body.id])).rows[0].status, 'pendente');
  assert.equal((await request(proposalPath + '/' + validProposal.body.id + '/edit', adminToken, { valor: 'Descrição editada válida' }, 'POST')).status, 200);
  record('suggestion_invalid_text', { create: 400, edit: 400, accept_justification: 400, valid_edit: 200 });
  for (const created_at of ['0', '2026-10-25T12:00:00+23:00']) {
    const invalidCursor = Buffer.from(JSON.stringify({ created_at, id: document })).toString('base64url');
    assert.equal((await request('/api/v1/projects/' + project + '/documents?cursor=' + invalidCursor)).status, 400);
  }
  await db.query("INSERT INTO documento(projeto_id,nome,caminho,mime,status_processamento,created_at) VALUES ($1,'QA cursor.txt','qa-cursor.txt','text/plain','processado','2026-10-25T12:00:00.000123Z')", [project]);
  const documentsFirstPage = await request('/api/v1/projects/' + project + '/documents?limit=1');
  assert.equal(documentsFirstPage.status, 200);
  assert.equal(typeof documentsFirstPage.body.next_cursor, 'string');
  const documentsSecondPage = await request('/api/v1/projects/' + project + '/documents?limit=1&cursor=' + documentsFirstPage.body.next_cursor);
  assert.equal(documentsSecondPage.status, 200); assert.equal(documentsSecondPage.body.items.length, 1);
  assert.notEqual(documentsFirstPage.body.items[0].id, documentsSecondPage.body.items[0].id);
  record('document_cursor_invalid_date', { status: 400, valid_list: 200 });
  for (const text of ['QA\u0000', 'QA\ud800']) {
    assert.equal((await request('/api/v1/epics', adminToken, { projeto_id: listProject, titulo: text }, 'POST')).status, 400);
    assert.equal((await request('/api/v1/epics/' + epic, adminToken, { descricao: text }, 'PATCH')).status, 400);
    assert.equal((await request('/api/v1/criteria', adminToken, { entidade_tipo: 'epico', entidade_id: epic, texto: text }, 'POST')).status, 400);
  }
  const config = (await request('/api/v1/quality/configuration/organization')).body;
  for (const value of ['rápido\u0000', 'rápido\ud800']) {
    const result = await request('/api/v1/quality/configuration/organization', adminToken, { expected_version: config.version, levels: config.levels, vague_terms: [value], exigir_justificativa_item_concluido: config.exigir_justificativa_item_concluido }, 'PUT');
    record('organization_dictionary_invalid_unicode_' + (value.includes('\u0000') ? 'nul' : 'surrogate'), result);
    assert.equal(result.status, 400);
    const legacy = (await request('/api/v1/quality/configuration/pbi')).body;
    assert.equal((await request('/api/v1/quality/configuration/pbi', adminToken, { checks: legacy.checks, vague_terms: [value] }, 'PUT')).status, 400);
  }
  assert.equal((await request('/api/v1/quality/configuration/organization')).body.version, config.version);
  const nulProject = await request('/api/v1/projects', adminToken, { nome: 'QA\u0000', cliente: 'QA' }, 'POST');
  record('project_name_nul', nulProject); assert.equal(nulProject.status, 400);
  const unicodeProject = await request('/api/v1/projects', adminToken, { nome: 'QA\ud800', cliente: 'QA' }, 'POST');
  record('project_name_invalid_surrogate', { status: unicodeProject.status, stored_name: unicodeProject.body.nome });
  assert.equal(unicodeProject.status, 400);
  for (const date of ['2026-02-30', '0', '2026-10-25T12:00:00+23:00', '2026-10-25T12:00:00-16:00']) {
    const result = await request('/api/v1/projects', adminToken, { nome: 'QA ' + randomUUID(), cliente: 'QA', data_inicio: date }, 'POST');
    record('project_invalid_date_' + date, result); assert.equal(result.status, 400);
    assert.equal((await request('/api/v1/projects/' + listProject, adminToken, { data_inicio: date }, 'PATCH')).status, 400);
  }
  assert.equal((await request('/api/v1/projects', adminToken, { nome: 'QA data válida', cliente: 'QA', data_inicio: '2024-02-29' }, 'POST')).status, 201);
  const longName = await request('/api/v1/auth/register', adminToken, { nome: 'a'.repeat(256), email: randomUUID() + '@example.test', password: 'qa-review-password' }, 'POST');
  record('register_name_256', longName); assert.equal(longName.status, 400);
  const longEmail = await request('/api/v1/auth/register', adminToken, { nome: 'Pessoa QA', email: 'a'.repeat(244) + '@example.test', password: 'qa-valid-password' }, 'POST');
  assert.equal(longEmail.status, 400); record('register_email_257', { status: longEmail.status });
  assert.equal((await request('/api/v1/auth/register', adminToken, { nome: 'a'.repeat(255), email: randomUUID() + '@example.test', password: 'qa-review-password' }, 'POST')).status, 201);
  await mkdir(output, { recursive: true });
  await writeFile(output + '/database-evidence.json', JSON.stringify({ head: '1261381', timestamp: new Date().toISOString(), evidence }, null, 2));
} finally {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  if (db) await db.end();
  if (started) docker(['rm', '-f', name]);
}
