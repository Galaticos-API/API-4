import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const containerName = `sinapse-backend-db-${randomUUID().slice(0, 8)}`;
const password = randomUUID();
const database = "sinapse_backend_test";
let containerStarted = false;

function docker(args: string[]): string {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Docker falhou (${args[0]}): ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function databaseTestFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return databaseTestFiles(path);
    return entry.name.endsWith(".db.test.ts") ? [path] : [];
  }).sort();
}

try {
  docker([
    "run", "-d", "--name", containerName,
    "-e", "POSTGRES_USER=sinapse",
    "-e", `POSTGRES_PASSWORD=${password}`,
    "-e", `POSTGRES_DB=${database}`,
    "-p", "127.0.0.1::5432",
    "pgvector/pgvector:pg16",
  ]);
  containerStarted = true;

  const port = JSON.parse(docker(["inspect", containerName]))[0].NetworkSettings.Ports["5432/tcp"][0].HostPort as string;
  const url = `postgresql://sinapse:${password}@127.0.0.1:${port}/${database}`;

  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = spawnSync("docker", ["exec", containerName, "pg_isready", "-h", "127.0.0.1", "-U", "sinapse", "-d", database], { encoding: "utf8" });
    if (result.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("PostgreSQL de integração não ficou pronto em 20 segundos.");

  const migration = spawnSync(process.execPath, ["--import", "tsx", "src/database/migrate.ts"], {
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: url },
  });
  if (migration.error) throw migration.error;
  process.stdout.write(migration.stdout);
  process.stderr.write(migration.stderr);
  if (migration.status !== 0) throw new Error(`Migrações falharam com código ${migration.status}.`);
  if (/there is already a transaction in progress|there is no transaction in progress/i.test(migration.stderr)) {
    throw new Error("O migrador emitiu avisos de transação PostgreSQL aninhada ou ausente.");
  }

  const files = databaseTestFiles("src");
  if (files.length === 0) throw new Error("Nenhum teste de integração PostgreSQL encontrado.");
  console.log(`Executando ${files.length} arquivos de integração PostgreSQL com todas as migrações aplicadas.`);

  const aliases = [
    "DATABASE_URL", "ARCHIVE_TEST_DATABASE_URL", "BACKLOG_TREE_TEST_DATABASE_URL",
    "HYBRID_SEARCH_TEST_DATABASE_URL", "KNOWLEDGE_TEST_DATABASE_URL",
    "INDEX_TEST_DATABASE_URL", "SEED_TEST_DATABASE_URL",
  ];
  const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...files], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      ...Object.fromEntries(aliases.map((name) => [name, url])),
    },
    stdio: "inherit",
  });
  process.exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  if (containerStarted) {
    try {
      const postgresLogs = docker(["logs", containerName]);
      if (/there is already a transaction in progress|there is no transaction in progress/i.test(postgresLogs)) {
        console.error("Os logs do PostgreSQL mostram avisos de transação aninhada ou ausente.");
        process.exitCode = 1;
      }
    } catch (error) {
      console.error("Não foi possível ler os logs do PostgreSQL temporário:", error);
      process.exitCode = 1;
    } finally {
      try {
        docker(["rm", "-f", "-v", containerName]);
        console.log("Banco PostgreSQL temporário removido.");
      } catch (error) {
        console.error("Não foi possível remover o PostgreSQL temporário:", error);
        process.exitCode = 1;
      }
    }
  }
}
