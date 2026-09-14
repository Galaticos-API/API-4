import test from "node:test";
import assert from "node:assert/strict";
import { applyDataset, loadDataset, validateDataset, validateTarget } from "./seed-lib.js";
import { Pool } from "pg";

test("acervo curado contém três projetos, seis documentos e seis chunks com origem", async () => {
  const data = await loadDataset();
  assert.equal(data.records.filter(row => row.table === "projeto").length, 3);
  assert.equal(data.records.filter(row => row.table === "documento").length, 6);
  assert.equal(data.records.filter(row => row.table === "chunk").length, 6);
  assert.equal(data.records.some(row => ["usuario", "competencia", "alocacao"].includes(row.table)), false);
});
test("recusa registro sem origem", async () => {
  const data = await loadDataset(); data.records[0].source.revision = "";
  assert.throws(() => validateDataset(data));
});
test("recusa mistura de projetos nos chunks", async () => {
  const data = await loadDataset(); data.records.find(row => row.table === "chunk")!.values.projeto_id = "outro";
  assert.throws(() => validateDataset(data));
});
test("recusa tabelas e caminhos fora da curadoria", async () => {
  const data = await loadDataset(); data.records[0].table = "usuario";
  assert.throws(() => validateDataset(data));
  const other = await loadDataset(); other.records.find(row => row.table === "documento")!.values.caminho = "../../secret";
  assert.throws(() => validateDataset(other));
});
test("recusa produção, destino ausente e banco não dedicado", () => {
  assert.throws(() => validateTarget(undefined, "test"));
  assert.throws(() => validateTarget("postgresql://localhost/acervo_test", "production"));
  assert.throws(() => validateTarget("postgresql://localhost/sinapse", "development"));
  assert.equal(validateTarget("postgresql://localhost/acervo_test", "test"), "postgresql://localhost/acervo_test");
});
test("carga SQL é idempotente e recusa sobrescrita", { skip: !process.env.SEED_TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: validateTarget(process.env.SEED_TEST_DATABASE_URL, "test") });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const data = await loadDataset();
    await applyDataset(client, data);
    await applyDataset(client, data);
    const count = await client.query("SELECT count(*)::int AS total FROM auditoria WHERE dados_json->>'dataset' = $1", [data.dataset]);
    assert.equal(count.rows[0].total, 15);
    await client.query("SAVEPOINT collision");
    const changed = structuredClone(data); changed.records[0].values.nome = "Alterado";
    await assert.rejects(applyDataset(client, changed));
    await client.query("ROLLBACK TO SAVEPOINT collision");
    const stored = await client.query("SELECT nome FROM projeto WHERE id = $1", [data.records[0].values.id]);
    assert.equal(stored.rows[0].nome, data.records[0].values.nome);
  } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
});
