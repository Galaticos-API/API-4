import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { Client } from "pg";
import { applyUntil } from "../src/database/migration-test-utils.js";
const id = "sinapse-s209-" + randomUUID().slice(0, 8),
  password = randomUUID(),
  token = randomUUID(),
  started: string[] = [];
function docker(args: string[]) {
  const r = spawnSync("docker", args, { encoding: "utf8" });
  if (r.status !== 0) throw Error("Docker: " + args[0] + " falhou");
  return r.stdout.trim();
}
function port(name: string, p: string) {
  return JSON.parse(docker(["inspect", name]))[0].NetworkSettings.Ports[p][0]
    .HostPort;
}
let captures: any[] = [];
const network=id+'-private';
let modelUrl='';
async function control(update?: Record<string, unknown>) {
 const response=await fetch(modelUrl+'/control', update ? {method:'POST',body:JSON.stringify(update)} : undefined);
 assert.equal(response.status,200);
 const snapshot=await response.json() as {captures:any[]}; captures=snapshot.captures;
}
let api: ReturnType<typeof createServer> | undefined,
  db: { end: () => Promise<void> } | undefined;
try {
  docker(['network','create',network]);
  const modelName=id+'-model';
  docker(['run','-d','--name',modelName,'--network',network,'--network-alias','harness-model','-e','HARNESS_TOKEN='+token,'--mount','type=bind,source='+resolve('scripts/harness-model.mjs')+',target=/mock.mjs,readonly','-p','127.0.0.1::11434','node:20-slim','node','/mock.mjs']);
  started.push(modelName);
  modelUrl='http://127.0.0.1:'+port(modelName,'11434/tcp')+'/'+token;
  for(let attempt=0;attempt<40;attempt++){try{await control();break;}catch(error){if(attempt===39)throw error;await new Promise(r=>setTimeout(r,250));}}
  assert.equal((await fetch(modelUrl+'/api/generate',{method:'POST',body:'x'.repeat(256*1024+1)})).status,413);
  assert.equal((await fetch(modelUrl+'/api/generate',{method:'POST',body:'{'})).status,400);
  assert.equal((await fetch(modelUrl.replace(token,'invalid')+'/control')).status,401);
  const pgName = id + "-db",
    aiName = id + "-ai";
  docker([
    "run",
    "-d",
    "--name",
    pgName,
    "-e",
    "POSTGRES_USER=sinapse",
    "-e",
    "POSTGRES_PASSWORD=" + password,
    "-e",
    "POSTGRES_DB=harness_test",
    "-p",
    "127.0.0.1::5432",
    "pgvector/pgvector:pg16",
  ]);
  started.push(pgName);
  for (let i = 0; i < 40; i++) {
    if (
      spawnSync(
        "docker",
        ["exec", pgName, "pg_isready", "-h", "127.0.0.1", "-U", "sinapse"],
        { stdio: "ignore" },
      ).status === 0
    )
      break;
    await new Promise((r) => setTimeout(r, 500));
  }
  Object.assign(process.env, {
    NODE_ENV: "test",
    AI_SERVICE_TOKEN: token,
    DOCUMENT_INGESTION_TOKEN: token,
    DATABASE_URL:
      "postgresql://sinapse:" +
      password +
      "@127.0.0.1:" +
      port(pgName, "5432/tcp") +
      "/harness_test",
  });
  const migration = new Client({ connectionString: process.env.DATABASE_URL });
  await migration.connect();
  try {
    await applyUntil(migration, true, () => false);
    await applyUntil(migration, true, () => false);
  } finally {
    await migration.end();
  }
  docker([
    "run",
    "-d",
    "--name",
    aiName,
    "--network",
    network,
    "-e",
    "AI_SERVICE_TOKEN=" + token,
    "-e",
    "DOCUMENT_INGESTION_TOKEN=" + token,
    "-e",
    "WORKSPACE_DIR=/tmp/analyzer",
    "-e",
    "PYTHONDONTWRITEBYTECODE=1",
    "-e",
    "OLLAMA_BASE_URL=http://harness-model:11434/" + token,
    "--mount",
    "type=bind,source=" + resolve("../ai-service") + ",target=/app,readonly",
    "-p",
    "127.0.0.1::8000",
    "sinapse-s209-ai-test",
  ]);
  started.push(aiName);
  process.env.AI_SERVICE_URL = "http://127.0.0.1:" + port(aiName, "8000/tcp");
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if (
        (
          await fetch(process.env.AI_SERVICE_URL + "/openapi.json", {
            headers: { "X-Service-Token": token },
          })
        ).ok
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(ready, "IA não iniciou");
  const { pool } = await import("../src/database/db.js");
  db = pool;
  const { app } = await import("../src/app.js");
  const { sessionService } =
    await import("../src/modules/auth/session.service.js");
  const { defaultConfig } =
    await import("../src/modules/harness/harness.contract.js");
  const { HarnessService } =
    await import("../src/modules/harness/harness.service.js");
  const [admin, po, dev, a, b, ca, cb] = Array.from({ length: 7 }, () =>
    randomUUID(),
  );
  await pool.query(
    "INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES($1::uuid,'Admin',$1::text||'@example.test','sintetico','admin'),($2::uuid,'PO',$2::text||'@example.test','sintetico','po'),($3::uuid,'Dev',$3::text||'@example.test','sintetico','dev')",
    [admin, po, dev],
  );
  await pool.query(
    "INSERT INTO projeto(id,nome,cliente,status) VALUES($1::uuid,$1::text,'Sintético','ativo'),($2::uuid,$2::text,'Sintético','ativo')",
    [a, b],
  );
  await pool.query(
    "INSERT INTO chunk(id,projeto_id,entidade_tipo,entidade_id,texto) VALUES($1,$3,'pbi',$1,'Consultar pedido no projeto A'),($2,$4,'pbi',$2,'Consultar pedido secreto do projeto B')",
    [ca, cb, a, b],
  );
  const sessions = await Promise.all(
    [admin, po, dev].map((user) => sessionService.createSession(user)),
  );
  api = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => api!.once("listening", r));
  const base =
    "http://127.0.0.1:" + (api.address() as { port: number }).port + "/api/v1";
  async function call(
    path: string,
    role: number | null = 0,
    method = "GET",
    body?: unknown,
  ) {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(role === null
          ? {}
          : { Authorization: "Bearer " + sessions[role].token }),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    await control();
    return { status: r.status, body: await r.json() };
  }
  const configPath = "/admin/ai-harness/levantamento",
    run = "/projects/" + a + "/ai/requests",
    request = {
      mode: "levantamento",
      operation: "questionar",
      level: "pbi",
      fields: { titulo: "Consultar pedido" },
    };
  assert.equal((await call(configPath, null)).status, 401);
  assert.equal((await call(configPath, 1)).status, 403);
  assert.equal((await call(configPath)).body.version, 0);
  assert.equal((await call(run, 2, "POST", request)).status, 404);
  const initial = await call(run, 1, "POST", request);
  assert.equal(initial.status, 200, JSON.stringify(initial.body));
  assert.equal(initial.body.version, 0);
  const config = {
    ...defaultConfig("levantamento"),
    instructions: "orientacao-v2: questionar somente lacunas relevantes",
  };
  assert.equal(
    (await call(configPath, 0, "PUT", { expected_version: 0, config })).status,
    201,
  );
  const next = await call(run, 1, "POST", request);
  assert.equal(next.body.version, 1);
  assert.equal(next.body.result.summary, "Nova revisão");
  assert.equal((await new HarnessService().current("levantamento")).version, 1);
  assert.equal((await call("/admin/ai-harness/consulta")).body.version, 0);
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      call(configPath, 0, "PUT", { expected_version: 1, config }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
  assert.deepEqual(
    (await call(configPath + "/history")).body.items.map((r: any) => r.version),
    [2, 1],
  );
  assert.equal(
    (
      await call(configPath, 0, "PUT", {
        expected_version: 2,
        config: defaultConfig("levantamento"),
      })
    ).status,
    201,
  );
  assert.equal(
    (await call(run, 1, "POST", request)).body.result.summary,
    "Revisão inicial",
  );
  await control({invalid:true});
  const bad = await call(run, 1, "POST", request);
  assert.equal(bad.status, 503);
  assert.ok(!JSON.stringify(bad.body).includes("SEGREDO"));
  await control({invalid:false});
  // S2-11: história incompleta não chega ao modelo; com permissão, vem o cenário de acesso não autorizado.
  const story = {
    titulo: "Aprovar pedido",
    historia_como_um: "gestor",
    historia_eu_quero: "aprovar pedidos com o perfil de administrador",
    historia_para_que: "liberar a entrega",
  };
  const scenarioRequest = { ...request, operation: "cenarios", fields: story };
  const modelCalls = captures.length;
  const incomplete = await call(run, 1, "POST", {
    ...scenarioRequest,
    fields: { ...story, historia_para_que: "" },
  });
  assert.equal(incomplete.status, 400);
  assert.equal(incomplete.body.code, "HISTORIA_INCOMPLETA");
  assert.deepEqual(incomplete.body.details.campos, ["historia_para_que"]);
  assert.equal(captures.length, modelCalls);
  const scenarios = await call(run, 1, "POST", scenarioRequest);
  assert.equal(scenarios.status, 200, JSON.stringify(scenarios.body));
  assert.deepEqual(
    scenarios.body.result.scenarios.map((item: any) => item.tipo),
    ["caminho_principal", "acesso_nao_autorizado"],
  );
  assert.ok(captures.at(-1).system.includes("acesso_nao_autorizado"));
  await control({clarificationOnly:true});
  try {
    const clarification = await call(run, 1, "POST", scenarioRequest);
    assert.equal(clarification.status, 200, JSON.stringify(clarification.body));
    assert.deepEqual(clarification.body.result.scenarios, []);
    assert.deepEqual(clarification.body.result.questions, ["Qual o resultado esperado quando o pedido nao existir?"]);
  } finally {
    await control({clarificationOnly:false});
  }
  const answer = await call(run, 1, "POST", {
    mode: "consulta",
    operation: "responder",
    fields: { pergunta: "Consultar pedido" },
  });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  assert.deepEqual(answer.body.result.sources, [ca]);
  assert.ok(!captures.at(-1).prompt.includes(cb));
  const chat = await call("/chat/query", 1, "POST", {
    pergunta: "Consultar pedido",
    projeto_id: a,
  });
  assert.equal(chat.status, 200, JSON.stringify(chat.body));
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM projeto")).rows[0].n,
    2,
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM ai_harness_revision"))
      .rows[0].n,
    3,
  );
  // Relatório concluído passa pelo mesmo endpoint de processamento dos documentos.
  const analysisId = randomUUID();
  await pool.query(`INSERT INTO analise_repositorio(id,projeto_id,usuario_id,repositorio_url,run_id,status,relatorio_markdown,metadados)
    VALUES($1,$2,$3,'https://github.com/test/relatorio',$4,'concluido',$5,$6::jsonb)`,
    [analysisId, a, po, 'report-' + analysisId, '# Arquitetura S223\n\nPostgreSQL em src/app.ts', JSON.stringify({ source_commit: 'a'.repeat(40), source_ref: 'main', analyzed_paths: ['src/app.ts'] })]);
  const { ReportIndexingWorker } = await import('../src/modules/repo-analyses/repo-analyses.indexing.worker.js');
  const reportWorker = new ReportIndexingWorker();
  await reportWorker.tick();
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM chunk WHERE entidade_id=$1',[analysisId])).rows[0].n,0);
  const revision=(await pool.query('SELECT relatorio_revisao FROM analise_repositorio WHERE id=$1',[analysisId])).rows[0].relatorio_revisao;
  assert.equal((await call(`/projects/${a}/repo-analyses/${analysisId}/report/approve`,1,'POST',{relatorio_revisao:revision})).status,200);
  await reportWorker.tick();
  const reportChunks = (await pool.query("SELECT * FROM chunk WHERE entidade_id=$1 AND entidade_tipo='analise_repositorio'", [analysisId])).rows;
  assert.ok(reportChunks.length > 0, 'Relatório deve ser indexado sem upload');
  assert.equal(reportChunks[0].metadados_json.source_commit, 'a'.repeat(40));
  assert.equal((await call(`/projects/${a}/repo-analyses/${analysisId}/indexing/retry`, 2, 'POST', {})).status, 404); // Dev sem alocação não pode descobrir a origem.
  assert.equal((await call(`/projects/${b}/repo-analyses/${analysisId}/indexing/retry`, 0, 'POST', {})).status, 404);
  assert.equal((await call(`/projects/${a}/repo-analyses/${analysisId}/indexing/retry`, 1, 'POST', {})).status, 200);
  await reportWorker.tick();
  assert.equal(Number((await pool.query('SELECT count(*) AS n FROM chunk WHERE entidade_id=$1', [analysisId])).rows[0].n), reportChunks.length);
  const reportSearch = await call(`/search?q=Arquitetura&projeto_id=${a}`);
  assert.equal(reportSearch.status, 200);
  assert.ok(reportSearch.body.items.some((item: any) => item.entity_id === analysisId));
  const isolatedSearch = await call(`/search?q=Arquitetura&projeto_id=${b}`);
  assert.equal(isolatedSearch.status, 200);
  assert.ok(!isolatedSearch.body.items.some((item: any) => item.entity_id === analysisId));
  const reportAnswer = await call('/chat/query', 0, 'POST', { pergunta: 'Arquitetura S223', projeto_id: a });
  assert.equal(reportAnswer.status, 200);
  assert.ok(reportAnswer.body.fontes.some((source: any) => source.titulo.includes('report-' + analysisId)));
  console.log('S2-23 aprovada: relatório -> processamento de documento -> embeddings -> PostgreSQL -> busca e chat, sem duplicação e com isolamento.');

  if (process.argv.includes("--browser")) {
    const { verifyCopilotBrowser } =
      await import("./verify-copilot-browser.mjs");
    await verifyCopilotBrowser({
      harnessEvidence: {
        before: { version: initial.body.version, result: initial.body.result },
        after: { version: next.body.version, result: next.body.result },
        history: (await call(configPath + "/history")).body.items.map(
          (item: any) => ({
            version: item.version,
            created_at: item.created_at,
          }),
        ),
        control: {
          consulta_version: (await call("/admin/ai-harness/consulta")).body
            .version,
          concurrent_statuses: concurrent.map((item) => item.status),
          rollback_creates_new_version: 3,
        },
      },
      apiUrl: base.replace(/\/api\/v1$/, ""),
      pool,
      token: sessions[1].token,
      projectId: a,
      setUnavailable: (value: boolean) => control({unavailable:value}),
      setDelay: (value: number) => control({delayMs:value}),
    });
  }
  console.log(
    "S2-09 aprovada: PostgreSQL + backend + FastAPI + Ollama simulado; revisão imediata, histórico, concorrência, rollback, autenticação, isolamento, schema inválido e chat.",
  );
} finally {
  if (api) {
    api.closeAllConnections();
    await new Promise<void>((r) => api!.close(() => r()));
  }
  if (db) await db.end();
  for (const name of started.reverse()) docker(["rm", "-f", "-v", name]);
  docker(["network", "rm", network]);
  console.log("Containers temporários removidos.");
}
