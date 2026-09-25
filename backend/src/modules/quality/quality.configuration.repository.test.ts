import test from "node:test";
import assert from "node:assert/strict";
import type { Pool, PoolClient } from "pg";
import { QualityConfigurationRepository } from "./quality.configuration.repository.js";
import type { PbiQualityConfigurationInput } from "./quality.types.js";

const checks = {
  titulo_infinitivo: true,
  historia_completa: true,
  cenario_estruturado: true,
  termos_vagos: true,
  prototipo_vinculado: true,
};

function configurationDatabase(existingPolicy: boolean) {
  let configuration: Record<string, unknown> = {
    checks,
    vague_terms: ["adequado"],
    exigir_justificativa_item_concluido: existingPolicy,
  };
  let version = 3;
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("SELECT") && sql.includes("FOR UPDATE")) {
        return { rows: [{
          id: "00000000-0000-4000-8000-000000000001",
          version,
          configuration,
          updated_at: new Date("2026-01-01T00:00:00Z"),
          updated_by: null,
          updated_by_name: null,
        }] };
      }
      if (sql.includes("UPDATE quality_configuration")) {
        version += 1;
        configuration = JSON.parse(String(values[1]));
        return { rows: [{
          id: "00000000-0000-4000-8000-000000000001",
          version,
          configuration,
          updated_at: new Date("2026-01-02T00:00:00Z"),
          updated_by: String(values[2]),
          updated_by_name: null,
        }] };
      }
      if (sql.includes("INSERT INTO auditoria")) return { rows: [], rowCount: 1 };
      if (sql.includes("SELECT id, nome FROM usuario")) return { rows: [{ id: values[0], nome: "Admin" }] };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const db = {
    connect: async () => client,
  } as unknown as Pool;
  return { repository: new QualityConfigurationRepository(db), getConfiguration: () => configuration };
}

const inputWithoutPolicy: PbiQualityConfigurationInput = {
  checks,
  vague_terms: ["adequado", "correto"],
};

test("salvar campos antigos preserva política de justificativa desativada", async () => {
  const { repository, getConfiguration } = configurationDatabase(false);

  const saved = await repository.updatePbiConfiguration(
    inputWithoutPolicy,
    "11111111-1111-4111-8111-111111111111",
  );

  assert.equal(saved.exigir_justificativa_item_concluido, false);
  assert.equal(getConfiguration().exigir_justificativa_item_concluido, false);
  assert.deepEqual(saved.vague_terms, ["adequado", "correto"]);
});

test("salvar campos antigos preserva política de justificativa ativada", async () => {
  const { repository } = configurationDatabase(true);

  const saved = await repository.updatePbiConfiguration(
    inputWithoutPolicy,
    "11111111-1111-4111-8111-111111111111",
  );

  assert.equal(saved.exigir_justificativa_item_concluido, true);
});

test("permite alterar explicitamente a política sem perder os demais campos", async () => {
  const { repository } = configurationDatabase(false);

  const saved = await repository.updatePbiConfiguration(
    { ...inputWithoutPolicy, exigir_justificativa_item_concluido: true },
    "11111111-1111-4111-8111-111111111111",
  );

  assert.equal(saved.exigir_justificativa_item_concluido, true);
  assert.deepEqual(saved.checks, checks);
});
