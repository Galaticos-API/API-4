import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { arch, cpus, platform, totalmem } from 'node:os';
import { Client } from 'pg';
import { applyUntil } from '../src/database/migration-test-utils.js';
import { applyDataset, loadDataset } from '../src/database/seed-lib.js';
const { withHarnessDeadline } = await import(new URL('./harness-deadline.mjs', import.meta.url).href);
const { cleanupEvaluation, createEvaluationOutput } = await import(new URL('./search-evaluation-utils.mjs', import.meta.url).href);

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1] ?? '';
}
const version = option('--version', '2');
const rounds = Number(option('--rounds', '3'));
assert.ok(['1', '2'].includes(version), 'Use --version 1 ou 2.');
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 10, 'Use de uma a dez rodadas.');
const python = option('--python', process.env.SEARCH_PYTHON ?? 'python');
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const executionId = new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomUUID().slice(0, 8);
const output = resolve(option('--output', '../ai-service/evaluation/results/s217-' + revision.slice(0, 7) + '-v' + version + '-' + executionId));
const name = 'sinapse-s217-' + randomUUID().slice(0, 8), token = randomUUID();
const containers: string[] = [];
const docker = (args: string[]) => {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Docker: operação ' + args[0] + ' falhou.');
  return result.stdout.trim();
};
const port = (container: string, key: string) => JSON.parse(docker(['inspect', container]))[0].NetworkSettings.Ports[key][0].HostPort;
const pythonRun = (args: string[], env: NodeJS.ProcessEnv = {}) => new Promise<string>((done, reject) => {
  const child = spawn(python, args, { env: { ...process.env, ...env, PYTHONIOENCODING: 'utf-8' }, windowsHide: true });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  child.on('error', reject);
  child.on('close', code => code === 0 ? done(stdout) : reject(new Error('Executor Python falhou: ' + stderr)));
});
let pool: any, server: any;
try {
  const datasetPath = resolve(option('--dataset', '../ai-service/evaluation/datasets/search-ptbr-v' + version + '.json'));
  const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));
  assert.equal(dataset.corpus?.dataset, 'pre06-historical-v' + version, 'O corpus do dataset deve corresponder a --version.');
  await pythonRun(['-c', 'import sys; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from evaluate_search import load_json,validate_dataset; validate_dataset(load_json(Path(sys.argv[2])))', resolve('../ai-service/evaluation'), datasetPath]);
  await createEvaluationOutput(output);
  const pg = name + '-db';
  docker(['run', '-d', '--name', pg, '-e', 'POSTGRES_USER=sinapse', '-e', 'POSTGRES_PASSWORD=' + token, '-e', 'POSTGRES_DB=sinapse_s217_test', '-p', '127.0.0.1::5432', 'pgvector/pgvector:pg16']);
  containers.push(pg);
  for (let i = 0; i < 40; i++) {
    if (spawnSync('docker', ['exec', pg, 'pg_isready', '-h', '127.0.0.1', '-U', 'sinapse'], { encoding: 'utf8' }).status === 0) break;
    await new Promise(done => setTimeout(done, 500));
  }
  process.env.DATABASE_URL = `postgresql://sinapse:${token}@127.0.0.1:${port(pg, '5432/tcp')}/sinapse_s217_test`;
  process.env.NODE_ENV = 'test'; process.env.SEED_DATASET_VERSION = version;
  const migration = new Client({ connectionString: process.env.DATABASE_URL }); await migration.connect();
  try { await applyUntil(migration, true, () => false); } finally { await migration.end(); }
  const ai = name + '-ai';
  docker(['run', '-d', '--name', ai, '-e', 'AI_SERVICE_TOKEN=' + token, '-e', 'DOCUMENT_INGESTION_TOKEN=' + token,
    '-e', 'OLLAMA_BASE_URL=http://host.docker.internal:11434', '-e', 'OLLAMA_EMBEDDING_MODEL=bge-m3', '-e', 'NODE_ENV=test', '--add-host', 'host.docker.internal:host-gateway',
    '-e', 'WORKSPACE_DIR=/tmp/analyzer', '-e', 'PYTHONDONTWRITEBYTECODE=1', '--mount', 'type=bind,source=' + resolve('../ai-service') + ',target=/app,readonly',
    '-p', '127.0.0.1::8000', 'sinapse-s209-ai-test']);
  containers.push(ai);
  process.env.AI_SERVICE_URL = 'http://127.0.0.1:' + port(ai, '8000/tcp');
  process.env.AI_SERVICE_TOKEN = token; process.env.DOCUMENT_INGESTION_TOKEN = token;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await withHarnessDeadline((signal: AbortSignal) => fetch(process.env.AI_SERVICE_URL + '/openapi.json', { headers: { 'X-Service-Token': token }, signal }), 2000)).ok; } catch {}
    if (ready) break;
    await new Promise(done => setTimeout(done, 500));
  }
  assert.ok(ready, 'O serviço de IA temporário não iniciou.');
  const [{ pool: db }, { app }, { AuthRepository }, { SessionService }] = await Promise.all([
    import('../src/database/db.js'), import('../src/app.js'), import('../src/modules/auth/auth.repository.js'), import('../src/modules/auth/session.service.js'),
  ]);
  pool = db;
  const data = await loadDataset();
  const client = await pool.connect();
  try { await client.query('BEGIN'); await applyDataset(client, data); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  const embed = async (text: string) => {
    const response = await fetch(process.env.AI_SERVICE_URL + '/embeddings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Token': token }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(120000) });
    assert.equal(response.status, 200, 'Falha ao gerar embedding local.');
    const result = await response.json() as { embedding: number[] };
    assert.equal(result.embedding.length, 1024);
    return '[' + result.embedding.join(',') + ']';
  };
  for (const record of data.records.filter(row => row.table === 'chunk')) {
    const vector = await embed(String(record.values.texto));
    await pool.query("UPDATE chunk SET embedding=$2::vector,metadados_json=metadados_json || '{\"embedding_status\":\"ready\",\"embedding_model\":\"bge-m3\"}'::jsonb WHERE id=$1", [record.values.id, vector]);
  }
  await pool.query("UPDATE documento SET status_processamento='processado'");
  await pool.query('ANALYZE chunk');
  const user = (await pool.query("INSERT INTO usuario(nome,email,senha_hash,role) VALUES ('QA S2-17',$1,'unused','admin') RETURNING id", [randomUUID() + '@example.test'])).rows[0].id;
  const session = await new SessionService(new AuthRepository(pool)).createSession(user);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(done => server.once('listening', done));
  const base = 'http://127.0.0.1:' + server.address().port;
  if (process.argv.includes('--diagnostics')) {
    const diagnostics = [];
    for (const query of dataset.queries) {
      const vector = await embed(query.query);
      const signals = await pool.query(`SELECT id, 1-(embedding <=> $2::vector) AS similarity,
        (SELECT count(*)::double precision FROM unnest(tsvector_to_array(to_tsvector('portuguese',$1))) term
          WHERE term=ANY(tsvector_to_array(to_tsvector('portuguese',texto))))
          / GREATEST(cardinality(tsvector_to_array(to_tsvector('portuguese',$1))),1) AS coverage,
        tsvector_to_array(to_tsvector('portuguese',$1)) AS query_terms,
        tsvector_to_array(to_tsvector('portuguese',texto)) AS source_terms
        FROM chunk WHERE projeto_id=$3 ORDER BY id`, [query.query,vector,query.project_id]);
      diagnostics.push({query_id:query.id,signals:signals.rows});
    }
    await writeFile(resolve(output, 'diagnostics.json'), JSON.stringify(diagnostics,null,2));
  }
  const warmup = new URLSearchParams({ q: dataset.queries[0].query, projeto_id: dataset.queries[0].project_id });
  assert.equal((await fetch(base + '/api/v1/search?' + warmup, { headers: { Cookie: 'sinapse_session=' + session.token }, signal: AbortSignal.timeout(30000) })).status, 200);
  const reports: unknown[] = [];
  for (let round = 1; round <= rounds; round++) {
    console.log(`S2-17: rodada ${round}/${rounds}, ${dataset.queries.length} consultas autenticadas, bge-m3 real.`);
    const results = resolve(output, `round-${round}-results.json`);
    await pythonRun([resolve('../ai-service/evaluation/run_search_suite.py'), '--dataset', datasetPath, '--output', results, '--api-base-url', base], {
      SINAPSE_SESSION_COOKIE: session.token, SEARCH_OLLAMA_WARMED_UP: 'true', SEARCH_EMBEDDING_MODEL: 'bge-m3',
    });
    const report = JSON.parse(await pythonRun([resolve('../ai-service/evaluation/evaluate_search.py'), '--dataset', datasetPath, '--results', results]));
    await writeFile(resolve(output, `round-${round}-metrics.json`), JSON.stringify(report, null, 2));
    reports.push(report);
    console.log(JSON.stringify({ round, retrieval: report.retrieval, latency: report.latency, isolation: report.project_isolation }));
  }
  const modelInfo = await (await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(10000) })).json() as { models: Array<{name:string;digest:string}> };
  const pythonVersion = (await pythonRun(['--version'])).trim();
  const { env: searchEnv } = await import('../src/config/env.js');
  const { SEARCH_CONCEPTS_VERSION } = await import('../src/modules/search/search.concepts.js');
  const searchConfiguration = {
    SEARCH_MIN_VECTOR_SIMILARITY: searchEnv.SEARCH_MIN_VECTOR_SIMILARITY,
    SEARCH_MIN_TEXT_RANK: searchEnv.SEARCH_MIN_TEXT_RANK,
    SEARCH_MIN_HYBRID_SCORE: searchEnv.SEARCH_MIN_HYBRID_SCORE,
    SEARCH_STRONG_VECTOR_SIMILARITY: searchEnv.SEARCH_STRONG_VECTOR_SIMILARITY,
    SEARCH_MIN_PARTIAL_SIMILARITY: searchEnv.SEARCH_MIN_PARTIAL_SIMILARITY,
    SEARCH_MIN_CONCEPT_SIMILARITY: searchEnv.SEARCH_MIN_CONCEPT_SIMILARITY,
    concepts_version: SEARCH_CONCEPTS_VERSION,
  };
  await writeFile(resolve(output, 'environment.json'), JSON.stringify({ revision, evaluated_at: new Date().toISOString(), dataset_version: dataset.version, corpus_version: version, search_configuration: searchConfiguration,
    corpus: data.dataset, chunks: data.records.filter(row => row.table === 'chunk').length,
    embedding_input: 'texto curado sem alteração do gabarito', model: modelInfo.models.filter(model => model.name.startsWith('bge-m3')).map(({name,digest}) => ({name,digest})),
    platform: platform(), architecture: arch(), cpu: cpus()[0]?.model, logical_cpus: cpus().length, memory_bytes: totalmem(),
    node: process.versions.node, python: pythonVersion, ai_image: docker(['image', 'inspect', 'sinapse-s209-ai-test', '--format', '{{.Id}}']),
    concurrency: 1, warmup_queries: 1, rounds, reports: reports.length, database: 'PostgreSQL/pgvector descartável', relevance_acceptance: 'pendente de critérios e revisão do PO/time' }, null, 2));
  const latencyPassed = reports.every((report: any) => report.latency.within_budget_rate === 1);
  await writeFile(resolve(output, 'summary.json'), JSON.stringify({ revision, dataset_version: dataset.version, corpus_version: version, search_configuration: searchConfiguration, rounds, total_queries: dataset.queries.length * rounds,
    latency_gate: { budget_ms: 2000, passed: latencyPassed }, isolation_gate: { passed: true, violations: 0 },
    relevance_gate: { status: 'pending_product_acceptance', thresholds: null }, reports }, null, 2));
  if (!latencyPassed) process.exitCode = 1;
  console.log('Resultados: ' + output);
} finally {
  const failures = await cleanupEvaluation([
    async () => { if (server) { server.closeAllConnections(); await new Promise<void>((done, reject) => server.close((error?: Error) => error ? reject(error) : done())); } },
    async () => { if (pool) await pool.end(); },
    ...containers.reverse().map(container => async () => { docker(['rm', '-f', '-v', container]); }),
  ]);
  if (failures.length) {
    process.exitCode = 1;
    console.error('Não foi possível encerrar todos os recursos temporários. Confira os contêineres sinapse-s217.');
  } else if (containers.length) console.log('Banco e serviço de IA descartáveis removidos.');
}
