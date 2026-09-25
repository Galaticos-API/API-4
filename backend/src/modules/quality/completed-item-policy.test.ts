import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { ValidationError } from "../../shared/errors.js";
import { assertJustificationForCompletedItem } from "./completed-item-policy.js";

const entityId = "33333333-3333-4333-8333-333333333333";
const checks = {
  titulo_infinitivo: true,
  historia_completa: true,
  cenario_estruturado: true,
  termos_vagos: true,
  prototipo_vinculado: true,
};

function transactionClient(status: string, requireJustification: boolean) {
  const queries: string[] = [];
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes("SELECT status FROM")) {
        return { rows: [{ status }], rowCount: 1 };
      }
      if (sql.includes("FROM quality_configuration")) {
        return {
          rows: [{
            id: "00000000-0000-4000-8000-000000000001",
            version: 1,
            configuration: {
              checks,
              vague_terms: [],
              exigir_justificativa_item_concluido: requireJustification,
            },
            updated_at: new Date("2026-01-01T00:00:00Z"),
            updated_by: null,
            updated_by_name: null,
          }],
          rowCount: 1,
        };
      }
      throw new Error(`Query inesperada no teste: ${sql}`);
    },
  };
  return { client: client as unknown as PoolClient, queries };
}

test("política transacional revalida o status atual antes de permitir escrita", async () => {
  const { client, queries } = transactionClient("concluido", true);

  await assert.rejects(
    assertJustificationForCompletedItem(client, "pbi", entityId),
    (error: unknown) => error instanceof ValidationError
      && error.message.includes("justificativa é obrigatória"),
  );

  assert.equal(queries.length, 2);
  assert.match(queries[1], /FOR SHARE OF c/);
});

test("política desativada permite alteração concluída sem justificativa", async () => {
  const { client, queries } = transactionClient("concluido", false);

  await assertJustificationForCompletedItem(client, "epico", entityId);

  assert.equal(queries.length, 2);
});

test("item ativo não consulta nem depende da política de justificativa", async () => {
  const { client, queries } = transactionClient("ativo", true);

  await assertJustificationForCompletedItem(client, "feature", entityId);

  assert.equal(queries.length, 1);
});

test("rejeita entidade ausente dentro da transação", async () => {
  const client = {
    query: async () => ({ rows: [], rowCount: 0 }),
  } as unknown as PoolClient;

  await assert.rejects(
    assertJustificationForCompletedItem(client, "epico", entityId),
    /Item não encontrado/,
  );
});
