import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AddressInfo } from "node:net";
import { parse } from "yaml";
import app from "./index.js";
import { listRoutes, normalizeRoute } from "./shared/route-inventory.js";

type PathItem = Record<string, unknown>;
type Document = { paths: Record<string, PathItem> };

const METHODS = ["get", "post", "put", "patch", "delete"] as const;
const DOCS = resolve(process.cwd(), "../docs/api");
const EXTERNAL_PREFIXES = ["/ingest", "/embeddings", "/rag", "/webhook", "/api/analyze", "/api/runs"];

const document = parse(readFileSync(resolve(DOCS, "openapi.yaml"), "utf8")) as Document;
const compat = parse(readFileSync(resolve(DOCS, "epics-compat.yaml"), "utf8")) as Record<string, PathItem>;

function expand(item: PathItem): PathItem {
  const reference = item.$ref;
  if (typeof reference !== "string") return item;
  const key = reference.split("#/")[1];
  return compat[key] ?? {};
}

function canonical(route: string): string {
  return normalizeRoute(route.replace(/^([A-Z]+) \/api\/(?!v1\b)/, "$1 /api/v1/"));
}

const documented = new Map<string, { path: string; method: string; secured: boolean }>();
for (const [path, rawItem] of Object.entries(document.paths)) {
  if (EXTERNAL_PREFIXES.some((prefix) => path.startsWith(prefix))) continue;
  const item = expand(rawItem);
  for (const method of METHODS) {
    const operation = item[method] as { security?: unknown[] } | undefined;
    if (!operation) continue;
    documented.set(canonical(`${method.toUpperCase()} ${path}`), {
      path,
      method: method.toUpperCase(),
      secured: !(Array.isArray(operation.security) && operation.security.length === 0),
    });
  }
}

const implemented = new Set(listRoutes(app).map(canonical));

test("todo endpoint documentado no OpenAPI existe no backend", () => {
  const missing = [...documented.keys()].filter((route) => !implemented.has(route));
  assert.deepEqual(missing, [], `Documentado mas não implementado:\n${missing.join("\n")}`);
});

test("todo endpoint entregue está documentado no OpenAPI (aliases /api/* equivalem a /api/v1/*)", () => {
  const undocumented = [...implemented].filter((route) => !documented.has(route));
  assert.deepEqual(undocumented, [], `Implementado mas não documentado:\n${undocumented.join("\n")}`);
});

test("endpoints documentados como protegidos recusam requisição sem sessão (401)", async () => {
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const failures: string[] = [];
    for (const { path, method, secured } of documented.values()) {
      if (!secured) continue;
      const url = `${base}${path.replace(/\{[^}]+\}/g, "a0000000-0000-4000-8000-000000000001")}`;
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" || method === "DELETE" ? undefined : "{}" });
      if (response.status !== 401) failures.push(`${method} ${path} -> ${response.status}`);
    }
    assert.deepEqual(failures, [], `Rotas documentadas como protegidas que responderam diferente de 401:\n${failures.join("\n")}`);
  } finally {
    server.close();
  }
});

test("endpoints públicos documentados são exatamente login, registro, raiz e health", () => {
  const open = [...documented.values()].filter((entry) => !entry.secured).map((entry) => `${entry.method} ${entry.path}`).sort();
  assert.deepEqual(open, ["GET /api/v1", "GET /health", "POST /api/v1/auth/login", "POST /api/v1/auth/register"]);
});
