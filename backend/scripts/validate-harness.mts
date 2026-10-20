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
let invalid = false;
let unavailable = false;
let delayMs = 0;
const captures: any[] = [];
const model = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "GET") {
    res.end('{"models":[]}');
    return;
  }
  let raw = "";
  for await (const part of req) raw += part;
  const payload = JSON.parse(raw);
  captures.push(payload);
  const data = JSON.parse(payload.prompt);
  if (unavailable) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: "Indisponível" }));
    return;
  }
  if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  const proposalSchema = payload.format.properties.proposal;
  const result = invalid
    ? { questions: [], summary: "SEGREDO", extra: "proibido" }
    : proposalSchema
      ? {
          proposal: Object.fromEntries(
            Object.keys(
              (proposalSchema.anyOf
                ? proposalSchema.anyOf.find(
                    (item: any) => item.type === "object",
                  )
                : proposalSchema
              ).properties,
            ).map((field) => [
              field,
              field === "titulo"
                ? "Consultar pagamento padronizado"
                : field === "regras_observacoes"
                  ? ""
                  : data.fields[field] || "Resultado funcional do produto",
            ]),
          ),
          questions: [],
        }
      : payload.format.properties.questions
        ? {
            questions: data.fields.titulo?.includes("pagamento")
              ? [
                  {
                    dimension: "validacoes",
                    question:
                      "Qual o tempo máximo para considerar a consulta rápida?",
                  },
                  {
                    dimension: "permissoes_seguranca",
                    question: "Quem pode consultar o pagamento?",
                  },
                ]
              : [],
            summary: payload.system.includes("orientacao-v2")
              ? "Nova revisão"
              : "Revisão inicial",
          }
        : { answer: "Evidência do projeto", sources: [data.context[0].id] };
  res.end(JSON.stringify({ response: JSON.stringify(result) }));
});
await new Promise<void>((r) => model.listen(0, "0.0.0.0", r));
let api: ReturnType<typeof createServer> | undefined,
  db: { end: () => Promise<void> } | undefined;
try {
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
    "--add-host",
    "host.docker.internal:host-gateway",
    "-e",
    "AI_SERVICE_TOKEN=" + token,
    "-e",
    "WORKSPACE_DIR=/tmp/analyzer",
    "-e",
    "PYTHONDONTWRITEBYTECODE=1",
    "-e",
    "OLLAMA_BASE_URL=http://host.docker.internal:" +
      (model.address() as { port: number }).port,
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
  invalid = true;
  const bad = await call(run, 1, "POST", request);
  assert.equal(bad.status, 503);
  assert.ok(!JSON.stringify(bad.body).includes("SEGREDO"));
  invalid = false;
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
      setUnavailable: (value: boolean) => {
        unavailable = value;
      },
      setDelay: (value: number) => {
        delayMs = value;
      },
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
  model.closeAllConnections();
  await new Promise<void>((r) => model.close(() => r()));
  for (const name of started.reverse()) docker(["rm", "-f", "-v", name]);
  console.log("Containers temporários removidos.");
}
