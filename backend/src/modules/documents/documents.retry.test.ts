import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { DocumentIngestionRepository, ingestionFailureReason } from "./documents.ingestion.js";

function createRepository(status = "falha", lockedUntil: Date | null = null) {
  const state = { status, updates: 0, rollback: false };
  const client = {
    async query(sql: string, values?: unknown[]) {
      if (sql === "ROLLBACK")
        state.rollback = true;
      if (sql.includes("AS archived"))
        return { rows: [{ archived: false }] };
      if (sql.startsWith("SELECT status_processamento")) {
        assert.deepEqual(values, ["document", "project"]);
        return { rows: [{ status_processamento: state.status, ingest_locked_until: lockedUntil }] };
      }
      if (sql.startsWith("UPDATE documento")) {
        assert.deepEqual(values, ["document", "project"]);
        assert.ok(sql.includes("projeto_id=$2"));
        state.status = "pendente";
        state.updates++;
      }
      return { rows: [] };
    }, release() { },
  };
  return { state, repository: new DocumentIngestionRepository({ async connect() { return client; } } as unknown as Pool) };
}
test("retry repetido preserva a tentativa pendente", async () => {
  const { state, repository } = createRepository();
  await repository.retry("project", "document");
  await repository.retry("project", "document");
  assert.equal(state.updates, 1);
});
test("retry ativo retorna conflito sem alterar a tentativa", async () => {
  const { state, repository } = createRepository("processando", new Date(Date.now() + 60000));
  await assert.rejects(repository.retry("project", "document"), /Documento em processamento/);
  assert.equal(state.updates, 0);
  assert.equal(state.rollback, true);
});
test("retry recupera lease expirado", async () => {
  const { state, repository } = createRepository("processando", new Date(0));
  await repository.retry("project", "document");
  assert.equal(state.status, "pendente");
  assert.equal(state.updates, 1);
});
test("motivos específicos não expõem códigos desconhecidos", () => {
  assert.match(ingestionFailureReason("INVALID_DOCUMENT"), /extrair/);
  assert.match(ingestionFailureReason("TIMEOUT"), /tempo limite/);
  assert.doesNotMatch(ingestionFailureReason("segredo-token"), /segredo/);
});
