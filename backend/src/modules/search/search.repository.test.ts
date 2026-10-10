import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { SearchRepository } from "./search.repository.js";

const PROJECT = "60000000-0000-4000-8000-000000000001";

test("full-text e busca vetorial recebem o mesmo escopo de projeto e filtros combinados", async () => {
  let sql = "";
  let params: unknown[] = [];
  const repo = new SearchRepository({
    async query(statement: string, values: unknown[]) {
      sql = statement;
      params = values;
      return { rows: [] };
    },
  } as unknown as Pool);
  await repo.hybridSearch({
    query: "login de cliente", projectId: PROJECT,
    technologyId: "60000000-0000-4000-8000-000000000099", level: "pbi", limit: 7,
  }, [0.1, 0.2], 0.35, 0.12);

  assert.match(sql, /WHERE c\.projeto_id = \$1/);
  assert.match(sql, /websearch_to_tsquery\('portuguese', \$2\)/);
  assert.match(sql, /lower\(metadados_json->>'source_locator'\) = lower\(btrim\(\$2\)\)/);
  assert.match(sql, /upper\(btrim\(\$2\)\) ~ '\^\[A-Z\]\{2,8\}-\[0-9\]\{1,6\}\$'/);
  assert.match(sql, /metadata_locator_match\s+OR \(NOT \(SELECT is_identifier_query FROM exact_identifier\)\s+AND search_vector @@ websearch_to_tsquery\('portuguese', \$2\)\)/);
  assert.match(sql, /NOT \(SELECT is_identifier_query FROM exact_identifier\)/);
  assert.match(sql, /search_vector/);
  assert.match(sql, /embedding <=> \$3::vector/);
  assert.match(sql, /et\.tecnologia_id = \$4/);
  assert.match(sql, /c\.entidade_tipo = \$5/);
  assert.match(sql, /WHERE rank >= \$8 OR rank = 10\.0/);
  assert.match(sql, /1 - distance >= \$7/);
  assert.deepEqual(params.slice(0, 2), [PROJECT, "login de cliente"]);
  assert.equal(params[2], "[0.1,0.2]");
  assert.equal(params[3], "60000000-0000-4000-8000-000000000099");
  assert.equal(params[4], "pbi");
  assert.equal(params[5], 7);
  assert.equal(params[6], 0.35);
  assert.equal(params[7], 0.12);
});

test("a busca devolve apenas linhas ordenadas produzidas pela fusão do banco", async () => {
  const row = {
    id: "chunk-1", project_id: PROJECT, project_name: "API 1", entity_type: "documento",
    entity_id: "document-1", title: "Acesso", text: "Login", metadata: {}, source_url: null, relevance_score: 0.03,
  };
  const repo = new SearchRepository({
    async query() { return { rows: [row] }; },
  } as unknown as Pool);
  assert.deepEqual(await repo.hybridSearch({ query: "login", projectId: PROJECT, limit: 5 }, [0.1], 0.3), [row]);
});
