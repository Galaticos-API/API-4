import test from "node:test";
import assert from "node:assert/strict";
import { AuditController } from "./audit.controller.js";
import { AuditService, AuditHistoryItem } from "./audit.service.js";
import { ValidationError } from "../../shared/errors.js";

class StubAuditService extends AuditService {
  public calls: Array<{ tipo: string; id: string }> = [];
  public items: AuditHistoryItem[] = [];

  constructor() { super(); }

  async listByEntity(entidadeTipo: string, entidadeId: string): Promise<AuditHistoryItem[]> {
    this.calls.push({ tipo: entidadeTipo, id: entidadeId });
    return this.items;
  }
}

test("PBI-01.5.6 Cenário 2: lista o histórico com justificativa, autor e data", async () => {
  const service = new StubAuditService();
  service.items = [{
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    entidade_tipo: "pbi",
    entidade_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    acao: "ATUALIZAR_PBI",
    justificativa: "Corrigir o título após revisão",
    dados_json: {},
    created_at: "2026-09-22T13:00:00.000Z",
    usuario_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    usuario_nome: "Ana PO",
  }];
  const controller = new AuditController(service);
  const res = { statusCode: 0, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };

  await controller.list(
    { query: { entidade_tipo: "pbi", entidade_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } } as never,
    res as never,
    () => undefined,
  );

  assert.equal(res.statusCode, 200);
  const body = res.body as { items: AuditHistoryItem[] };
  assert.equal(body.items[0].justificativa, "Corrigir o título após revisão");
  assert.equal(body.items[0].usuario_nome, "Ana PO");
  assert.equal(body.items[0].created_at, "2026-09-22T13:00:00.000Z");
});

test("consulta de histórico recusa tipo de entidade inválido", async () => {
  const controller = new AuditController(new StubAuditService());
  let captured: unknown;
  await controller.list(
    { query: { entidade_tipo: "projeto", entidade_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } } as never,
    { status() { return this; }, json() { return this; } } as never,
    (error) => { captured = error; },
  );
  assert.ok(captured instanceof ValidationError);
});
