import { createServer, type Server } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { applyUntil } from "../src/database/migration-test-utils.js";

const name = "sinapse-s203-test-" + randomUUID().slice(0,8);
const password = randomUUID();
function docker(args: string[]) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error("Não foi possível preparar o PostgreSQL de testes.");
  return result.stdout.trim();
}
let started = false;
let bridge: Server | undefined;
try {
  docker(["run","-d","--name",name,"-e","POSTGRES_USER=sinapse","-e","POSTGRES_PASSWORD="+password,
    "-e","POSTGRES_DB=sinapse_s203_test","-p","127.0.0.1::5432","pgvector/pgvector:pg16"]);
  started = true;
  const port = JSON.parse(docker(["inspect",name]))[0].NetworkSettings.Ports["5432/tcp"][0].HostPort;
  const url = "postgresql://sinapse:"+password+"@127.0.0.1:"+port+"/sinapse_s203_test";
  let ready = false;
  for (let i=0;i<40;i++) {
    const result=spawnSync("docker",["exec",name,"pg_isready","-h","127.0.0.1","-U","sinapse","-d","sinapse_s203_test"],{encoding:"utf8"});
    if (result.status===0) { ready=true; break; }
    await new Promise(r=>setTimeout(r,500));
  }
  if (!ready) throw new Error("PostgreSQL não ficou pronto.");
  const client = new Client({connectionString:url});
  await client.connect();
  try { await applyUntil(client,true,()=>false); } finally { await client.end(); }
  console.log("Todas as migrações aplicadas em banco isolado com pgvector.");
  let realEndpoint = "";
  if (process.argv.includes("--real-ai")) {
    bridge = createServer(async (req, res) => {
      const buffers = [];
      for await (const part of req) buffers.push(part);
      const python = [
        "import os,sys,urllib.request",
        "payload=sys.stdin.buffer.read()",
        "request=urllib.request.Request('http://127.0.0.1:8000/ingest/entity',data=payload,headers={'Content-Type':'application/json','X-Service-Token':os.environ['AI_SERVICE_TOKEN']})",
        "response=urllib.request.urlopen(request,timeout=120)",
        "sys.stdout.buffer.write(response.read())",
      ].join("\n");
      const response = spawnSync("docker", ["exec","-i","sinapse-ai-service","python","-c",python], {
        input: Buffer.concat(buffers), maxBuffer: 8 * 1024 * 1024, timeout: 125000,
      });
      res.setHeader("Content-Type", "application/json");
      res.statusCode = response.status === 0 ? 200 : 502;
      res.end(response.status === 0 ? response.stdout : JSON.stringify({ error: "Serviço IA indisponível." }));
    });
    await new Promise<void>(r => bridge!.listen(0, "127.0.0.1", r));
    realEndpoint = "http://127.0.0.1:" + (bridge.address() as { port: number }).port;
  }
  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath,["--import","tsx","--test",
    ...(process.argv.includes('--search') ? ['src/modules/search/search.relevance.db.test.ts','src/modules/search/search.access.db.test.ts'] : process.argv.includes('--quality') ? ['src/modules/quality/organization-quality.db.test.ts','src/modules/chat/rag.db.test.ts','src/modules/chat/project-readiness.db.test.ts'] : ["src/modules/indexing/indexing.db.test.ts","src/modules/indexing/indexing.migration.db.test.ts","src/modules/indexing/indexing.transport.db.test.ts","src/modules/indexing/indexing.state.db.test.ts","src/modules/indexing/indexing.recovery.db.test.ts","src/modules/indexing/indexing.worker.test.ts","src/modules/indexing/indexing.integration.db.test.ts","src/modules/repo-analyses/repo-analyses.indexing.db.test.ts"])],{
    env:{...process.env,NODE_ENV:"test",DATABASE_URL:url,INDEX_TEST_DATABASE_URL:url,ARCHIVE_TEST_DATABASE_URL:process.argv.includes('--search') ? url : '',QUALITY_TEST_DATABASE_URL:process.argv.includes('--quality') ? url : '',INDEX_AI_ENDPOINT:realEndpoint},
    stdio:"inherit",
  });
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 1));
  });
  process.exitCode=exitCode;
  if (exitCode === 0 && !process.argv.includes('--quality') && !process.argv.includes('--search')) {
    const suggestions = spawnSync(process.execPath, ["--import", "tsx", "--test", "src/modules/audit/versions.db.test.ts", "src/modules/similar-items/similar-items.db.test.ts", "src/modules/suggestions/suggestions.db.test.ts", "src/modules/pbis/pbis.relations.db.test.ts", "src/modules/documents/chunks.http.db.test.ts", "src/modules/search/search.access.db.test.ts", "src/modules/search/search.relevance.db.test.ts", "src/modules/auth/auth.registration.db.test.ts"], {
      env: { ...process.env, NODE_ENV: "test", DATABASE_URL: url, ARCHIVE_TEST_DATABASE_URL: url },
      stdio: "inherit",
    });
    process.exitCode = suggestions.status ?? 1;
  }
} finally {
  if (bridge) { bridge.closeAllConnections(); await new Promise<void>(r => bridge!.close(() => r())); }
  if (started) { docker(["rm","-f","-v",name]); console.log("Banco temporário removido."); }
}
