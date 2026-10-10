import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { env } from "./env.js";

test("configuração de ambiente aplica valores padrão seguros", () => {
  assert.ok(["development", "production", "test"].includes(env.NODE_ENV));
  assert.equal(typeof env.PORT, "number");
  assert.equal(typeof env.POSTGRES_PORT, "number");
  assert.match(env.AI_SERVICE_URL, /^https?:\/\//);
  assert.equal(env.SEARCH_MIN_VECTOR_SIMILARITY, 0.55);
});

test("produção exige um segredo privado para a ingestão", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", "import('./src/config/env.ts')"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      DOCUMENT_INGESTION_TOKEN: "",
    },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Configure um segredo aleatório privado/);
});

test("produção rejeita o token padrão de desenvolvimento do n8n", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", "import('./src/config/env.ts')"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      DOCUMENT_INGESTION_TOKEN: "a".repeat(32),
      N8N_INGEST_TOKEN: "sinapse-dev-ingest-token",
    },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /N8N_INGEST_TOKEN/);
});

test("limite configurável de documentos não pode exceder a capacidade da ingestão", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", "import('./src/config/env.ts')"], {
    cwd: process.cwd(),
    env: { ...process.env, DOCUMENT_MAX_SIZE_MB: "21" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
});
