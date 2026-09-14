import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { PoolClient } from "pg";

const fields: Record<string, string[]> = {
  projeto: ["id", "nome", "cliente", "descricao", "status"],
  documento: ["id", "projeto_id", "nome", "mime", "caminho", "status_processamento"],
  chunk: ["id", "projeto_id", "entidade_tipo", "entidade_id", "texto", "metadados_json"],
};
export interface SeedRecord { table: string; values: Record<string, unknown>; source: Record<string, string> }
export interface Dataset { dataset: string; version: number; source_decision: Record<string, string>; records: SeedRecord[] }
export const fixturePath = resolve(process.cwd(), "../database/seed/fixtures/historical-v1.json");

export function validateDataset(input: unknown): asserts input is Dataset {
  const data = input as Dataset;
  if (data?.dataset !== "pre06-historical-v1" || data.version !== 1 || !data.source_decision?.decision || !Array.isArray(data.records) || !data.records.length) throw new Error("Manifesto inválido");
  const seen = new Map<string, SeedRecord>();
  for (const row of data.records) {
    const columns = fields[row.table];
    if (!columns || !row.values || !isDeepStrictEqual(Object.keys(row.values).sort(), [...columns].sort())) throw new Error("Tabela ou campos não permitidos");
    const id = row.values.id;
    if (typeof id !== "string" || !/^60000000-0000-4000-8000-\d{12}$/.test(id) || seen.has(id)) throw new Error("ID inválido ou duplicado");
    const source = row.source;
    if (!source || !/^https:\/\/github.com\/Galaticos-API\/API-[123]$/.test(source.repository)
      || !/^[a-f0-9]{40}$/.test(source.revision) || !/^[a-f0-9]{64}$/.test(source.source_sha256)
      || !/^(readme\.md|DOCS\/Documentação das Sprints\/DocSprint1\.md|DOCS\/analise_backend\/analiseRequisitosBackend\.md)$/.test(source.path)
      || !source.locator || source.classification !== "curated-public-documentation"
      || !source.transformation || !source.url?.startsWith(`${source.repository}/blob/${source.revision}/`)) throw new Error("Origem ausente ou não permitida");
    if (row.table === "documento") {
      if (seen.get(String(row.values.projeto_id))?.table !== "projeto") throw new Error("Projeto de documento inválido");
      if (!/^database\/seed\/curated\/[a-z0-9-]+\.md$/.test(String(row.values.caminho))) throw new Error("Caminho não permitido");
    }
    if (row.table === "chunk") {
      const parent = seen.get(String(row.values.entidade_id));
      const metadata = row.values.metadados_json as Record<string, unknown>;
      if (row.values.entidade_tipo !== "documento" || parent?.table !== "documento" || parent.values.projeto_id !== row.values.projeto_id
        || metadata?.dataset !== data.dataset || metadata.source_url !== source.url || metadata.embedding_status !== "pending") throw new Error("Chunk sem isolamento ou origem");
    }
    seen.set(id, row);
  }
}

export async function loadDataset(): Promise<Dataset> {
  const data: unknown = JSON.parse(await readFile(fixturePath, "utf8"));
  validateDataset(data);
  for (const row of data.records.filter(row => row.table === "documento")) {
    const text = await readFile(resolve(process.cwd(), "..", String(row.values.caminho)), "utf8");
    if (!text.includes(row.source.url)) throw new Error("Documento curado sem referência");
  }
  return data;
}

export function validateTarget(url: string | undefined, environment: string | undefined): string {
  if (!url || environment === "production") throw new Error("Seed restrito a banco de desenvolvimento/teste explícito");
  const target = new URL(url);
  if (!["postgres:", "postgresql:"].includes(target.protocol) || !/_(dev|test)$/.test(decodeURIComponent(target.pathname))) throw new Error("Banco deve terminar em _dev ou _test");
  return url;
}

// Caller owns BEGIN/COMMIT/ROLLBACK. No partial application, update or deletion.
export async function applyDataset(client: PoolClient, data: Dataset): Promise<void> {
  validateDataset(data);
  await client.query("SELECT pg_advisory_xact_lock(604006)");
  for (const row of data.records) {
    const keys = fields[row.table];
    const id = String(row.values.id);
    const auditId = id.replace(/^60000000/, "61000000");
    const evidence = { dataset: data.dataset, version: data.version, source: row.source,
      payload_sha256: createHash("sha256").update(JSON.stringify(row.values)).digest("hex") };
    const existing = await client.query(`SELECT ${keys.join(",")} FROM ${row.table} WHERE id = $1`, [id]);
    const audit = await client.query("SELECT dados_json FROM auditoria WHERE id = $1", [auditId]);
    if (existing.rowCount) {
      if (!isDeepStrictEqual(existing.rows[0], row.values) || !isDeepStrictEqual(audit.rows[0]?.dados_json, evidence)) throw new Error("Colisão ou divergência em registro do seed; nenhuma sobrescrita realizada");
      continue;
    }
    if (audit.rowCount) throw new Error("Origem existente sem registro correspondente");
    await client.query(`INSERT INTO ${row.table} (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`, keys.map(key => row.values[key]));
    await client.query("INSERT INTO auditoria (id, entidade_tipo, entidade_id, acao, justificativa, dados_json) VALUES ($1,$2,$3,'seed_import',$4,$5)",
      [auditId, row.table, id, "PRE-06: carga curada de documentação pública; origem registrada", evidence]);
  }
}
