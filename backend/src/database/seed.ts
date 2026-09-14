import { Pool } from "pg";
import { applyDataset, loadDataset, validateTarget } from "./seed-lib.js";

async function main() {
  const mode = process.argv[2] ?? "--validate";
  if (!["--validate", "--apply"].includes(mode)) throw new Error("Modo inválido");
  const data = await loadDataset();
  if (mode === "--validate") {
    console.log(`[Seed] Manifesto e documentos válidos: ${data.records.length} registros.`);
    return;
  }
  const connectionString = validateTarget(process.env.SEED_DATABASE_URL, process.env.NODE_ENV);
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await applyDataset(client, data);
      await client.query("COMMIT");
      console.log(`[Seed] Carga concluída: ${data.records.length} registros com origem.`);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } finally { await pool.end(); }
}

main().catch(() => {
  // Never dump connection strings, database details or source payloads to logs.
  console.error("[Seed] Falha na validação/carga. Confira migrações, banco permitido e colisões; transação não confirmada.");
  process.exitCode = 1;
});
