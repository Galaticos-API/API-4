import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { AuditService, decodeAuditCursor, encodeAuditCursor } from "./audit.service.js";
import { buildAuditChangeData } from "./audit.payloads.js";

const entityId = "33333333-3333-4333-8333-333333333333";

function auditRow(id: string, createdAt: string) {
  return {
    id,
    usuario_id: null,
    usuario_nome: null,
    entidade_tipo: "epico",
    entidade_id: entityId,
    acao: "ATUALIZAR_EPICO",
    justificativa: null,
    dados_json: {},
    created_at: createdAt,
  };
}

test("cursor de auditoria faz roundtrip canônico e rejeita conteúdo inválido", () => {
  const cursor = {
    created_at: "2026-09-24T12:00:00.000Z",
    id: "11111111-1111-4111-8111-111111111111",
  };

  assert.deepEqual(decodeAuditCursor(encodeAuditCursor(cursor)), cursor);
  assert.throws(() => decodeAuditCursor("!!!"), /Cursor do histórico inválido/);
  assert.throws(() => decodeAuditCursor(Buffer.from("{}", "utf8").toString("base64url")), /Cursor do histórico inválido/);
});

test("payload de auditoria registra campos anteriores/novos sem duplicar a justificativa", () => {
  const payload = buildAuditChangeData(
    { titulo: "Antes", objetivo: "Objetivo antigo" },
    { titulo: "Depois", objetivo: "Objetivo novo" },
    { titulo: "Depois", objetivo: "Objetivo novo", justificativa: "Aprovado" },
  );

  assert.deepEqual(payload, {
    alteracoes: { titulo: "Depois", objetivo: "Objetivo novo" },
    anterior: { titulo: "Antes", objetivo: "Objetivo antigo" },
    novo: { titulo: "Depois", objetivo: "Objetivo novo" },
  });
});

test("histórico busca limite+1 e cria cursor estável na última linha devolvida", async () => {
  const timestamp = "2026-09-24T12:00:00.000Z";
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (sql.includes("SELECT 1 FROM epico")) return { rows: [{ "?column?": 1 }], rowCount: 1 };
      return {
        rows: [
          auditRow("33333333-3333-4333-8333-333333333333", timestamp),
          auditRow("22222222-2222-4222-8222-222222222222", timestamp),
          auditRow("11111111-1111-4111-8111-111111111111", timestamp),
        ],
        rowCount: 3,
      };
    },
  } as unknown as Pool;

  const page = await new AuditService(db).getHistory("epico", entityId, 2);

  assert.equal(page.items.length, 2);
  assert.deepEqual(decodeAuditCursor(page.next_cursor!), {
    created_at: timestamp,
    id: "22222222-2222-4222-8222-222222222222",
  });
  assert.match(calls[1].sql, /\(a\.created_at, a\.id\) < \(\$3::timestamptz, \$4::uuid\)/);
  assert.match(calls[1].sql, /ORDER BY a\.created_at DESC, a\.id DESC/);
  assert.equal(calls[1].values[4], 3);
});

test("histórico rejeita limites fora do intervalo e entidade inexistente", async () => {
  let entityExists = false;
  const db = {
    query: async () => entityExists
      ? { rows: [{ id: entityId }], rowCount: 1 }
      : { rows: [], rowCount: 0 },
  } as unknown as Pool;
  const service = new AuditService(db);

  await assert.rejects(service.getHistory("epico", entityId, 101), /entre 1 e 100/);
  await assert.rejects(service.getHistory("epico", entityId), /Item não encontrado/);
  await assert.rejects(service.getHistory("inválido" as never, entityId), /Tipo de entidade inválido/);
});

test("histórico de PBI associa a versão salva sem alterar consultas de outros itens", async () => {
  const timestamp = "2026-09-24T12:00:00.000Z";
  const calls: string[] = [];
  const db = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes("SELECT 1 FROM pbi")) return { rows: [{ id: entityId }], rowCount: 1 };
      return {
        rows: [{ ...auditRow("33333333-3333-4333-8333-333333333333", timestamp), entidade_tipo: "pbi", pbi_versao: 3, pbi_snapshot: { titulo: "PBI atualizado" } }],
        rowCount: 1,
      };
    },
  } as unknown as Pool;

  const page = await new AuditService(db).getHistory("pbi", entityId);
  assert.match(calls[1], /LEFT JOIN pbi_versao v/);
  assert.match(calls[1], /jsonb_strip_nulls\(jsonb_build_object/);
  assert.doesNotMatch(calls[1], /v\.snapshot_json AS pbi_snapshot/);
  assert.deepEqual(page.items[0].pbi_snapshot, { titulo: "PBI atualizado" });
  assert.equal(page.items[0].pbi_versao, 3);
});
