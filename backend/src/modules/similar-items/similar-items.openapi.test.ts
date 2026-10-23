import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

type Operation = {
  security?: Array<Record<string, unknown>>;
  requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> };
  responses?: Record<string, { $ref?: string; content?: Record<string, { schema?: { $ref?: string } }> }>;
};
type Document = { paths: Record<string, { post?: Operation; parameters?: Array<{ name: string; in: string; required?: boolean }> }>; components: { schemas: Record<string, unknown> } };

const document = parse(readFileSync(resolve(process.cwd(), "../docs/api/openapi.yaml"), "utf8")) as Document;

const SEARCH = "/api/v1/projects/{projectId}/similar-items";
const REUSE = ["epics", "features", "pbis"].map((level) => `/api/v1/${level}/{id}/similar-items/{origemId}/reuse`);

function schemaName(reference: string | undefined): string {
  return String(reference).replace("#/components/schemas/", "");
}

test("S2-12: a busca está documentada com autenticação, corpo, resposta e erros", () => {
  const item = document.paths[SEARCH];
  assert.ok(item?.post, "POST de busca documentado");
  assert.deepEqual(item.post.security, [{ cookieAuth: [] }]);
  assert.ok(item.parameters?.some((parameter) => parameter.name === "projectId" && parameter.in === "path" && parameter.required));
  assert.ok(item.post.requestBody?.content?.["application/json"]?.schema?.$ref);
  assert.equal(schemaName(item.post.responses?.["200"]?.content?.["application/json"]?.schema?.$ref), "SimilarItemsResult");
  for (const code of ["400", "401", "404"]) assert.ok(item.post.responses?.[code], `resposta ${code} documentada`);
  assert.equal(item.post.responses?.["403"], undefined, "consulta é aberta a todos os perfis autenticados");
});

test("S2-12: o aproveitamento está documentado nos três níveis com autorização e conflitos", () => {
  for (const path of REUSE) {
    const item = document.paths[path];
    assert.ok(item?.post, `${path} documentado`);
    assert.deepEqual(item.post.security, [{ cookieAuth: [] }]);
    assert.ok(["id", "origemId"].every((name) => item.parameters?.some((parameter) => parameter.name === name && parameter.in === "path" && parameter.required)), `${path}: parâmetros de caminho`);
    assert.equal(schemaName(item.post.responses?.["201"]?.content?.["application/json"]?.schema?.$ref), "SimilarItemsReuseResult");
    for (const code of ["400", "401", "403", "404", "409"]) assert.ok(item.post.responses?.[code], `${path}: resposta ${code} documentada`);
  }
});

test("S2-12: todos os schemas referenciados existem em components", () => {
  for (const name of ["SimilarItemsSearchInput", "SimilarItem", "SimilarItemsResult", "SimilarItemsReuseInput", "SimilarItemsReuseResult"]) {
    assert.ok(document.components.schemas[name], `schema ${name}`);
  }
  const raw = readFileSync(resolve(process.cwd(), "../docs/api/openapi.yaml"), "utf8");
  for (const match of raw.matchAll(/\$ref: '#\/components\/schemas\/(Similar\w+)'/g)) {
    assert.ok(document.components.schemas[match[1]], `$ref para ${match[1]} resolve`);
  }
});
