import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { indexingFailureCode, validatePreparedEntity } from "./indexing.worker.js";

test("valida vetor, conteúdo e escopo retornados pela IA", () => {
  const project = randomUUID();
  const data = { entity_type: "pbi", content: "Requisito", metadata: { project_id: project }, embedding: Array(1024).fill(0.1) };
  assert.equal(validatePreparedEntity(data, "pbi", project).content, "Requisito");
  for (const invalid of [
    { ...data, content: "" }, { ...data, embedding: [1] },
    { ...data, embedding: Array(1024).fill(0) }, { ...data, embedding: Array(1024).fill(Infinity) },
    { ...data, metadata: { project_id: randomUUID() } }, { ...data, entity_type: "decisao" },
  ]) assert.throws(() => validatePreparedEntity(invalid, "pbi", project));
});

test("diagnósticos não expõem mensagens, corpo HTTP ou credenciais", () => {
  assert.equal(indexingFailureCode({ isAxiosError: true, code: "ECONNABORTED" }), "TIMEOUT");
  assert.equal(indexingFailureCode({ isAxiosError: true, response: { status: 503, data: "segredo" } }), "SERVICE_HTTP_ERROR");
  assert.equal(indexingFailureCode(new Error("token secreto")), "PROCESSING_ERROR");
  assert.equal(indexingFailureCode(new Error("INVALID_SCOPE")), "INVALID_SCOPE");
});
