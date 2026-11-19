import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express, { type NextFunction, type Request, type Response } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { errorHandler } from "../../middleware/errorHandler.js";
import { createProjectAccessRouter } from "../../middleware/projectAccess.js";
import { NotFoundError } from "../../shared/errors.js";
import type { ProjectAccess } from "../projects/project-access.js";
import { createBacklogExportHandlers } from "./backlog-export.controller.js";
import type { BacklogExportReader, EpicExportRecord, FeatureExportRecord } from "./backlog-export.repository.js";
import { BacklogExportService } from "./backlog-export.service.js";

const EPIC = "11111111-1111-4111-8111-111111111111";
const FEATURE = "22222222-2222-4222-8222-222222222222";
const ARCHIVED_EPIC = "33333333-3333-4333-8333-333333333333";
const FOREIGN_EPIC = "44444444-4444-4444-8444-444444444444";
const MISSING = "55555555-5555-4555-8555-555555555555";

const feature = {
  id: FEATURE, epico_id: EPIC, numero: 1, titulo: "Rastreabilidade das decisões", descricao: "d", objetivo: "o",
  prioridade: "Must", status: "rascunho", criterios: [],
  pbis: [{
    id: "p1", feature_id: FEATURE, numero: 5, titulo: "Exportar especificação", prioridade: "Could", status: "rascunho",
    historia_como_um: "Product Owner", historia_eu_quero: "exportar", historia_para_que: "compartilhar", regras_observacoes: null, cenarios: [],
  }],
};
const epicRecord = (id: string, status = "rascunho"): EpicExportRecord => ({
  projeto_status: "ativo",
  epic: { id, numero: 1, titulo: "Especificar o backlog", status, descricao: "d", objetivo: "o", escopo_macro: "e",
    resultado_esperado: "r", prioridade: "Must", criterios: [], features: [feature] },
});

class FakeReader implements BacklogExportReader {
  async loadEpic(id: string): Promise<EpicExportRecord | null> {
    if (id === EPIC) return epicRecord(EPIC);
    if (id === ARCHIVED_EPIC) return epicRecord(ARCHIVED_EPIC, "arquivado");
    return null;
  }
  async loadFeature(id: string): Promise<FeatureExportRecord | null> {
    if (id !== FEATURE) return null;
    return { projeto_status: "ativo", epic: { id: EPIC, numero: 1, titulo: "Especificar o backlog", status: "rascunho" }, feature };
  }
}

// Mesmo guard usado em app.ts, com acesso negado ao projeto do FOREIGN_EPIC.
const access = {
  async assertEntity(_userId: string, _kind: string, id: string) {
    if (id === FOREIGN_EPIC) throw new NotFoundError("Item não encontrado.");
  },
} as unknown as ProjectAccess;

let server: Server;
let baseUrl: string;
let authenticated = true;

before(() => {
  const app = express();
  const authenticate = (req: Request, res: Response, next: NextFunction) => {
    if (!authenticated) { res.status(401).json({ error: "Autenticação necessária." }); return; }
    req.auth = { id: "user", nome: "Dev", email: "dev@example.com", role: "dev" };
    next();
  };
  const handlers = createBacklogExportHandlers(new BacklogExportService(new FakeReader()));
  app.use("/api/v1", createProjectAccessRouter(access, authenticate));
  app.get("/api/v1/epics/:id/export/markdown", handlers.epic);
  app.get("/api/v1/features/:id/export/markdown", handlers.feature);
  app.use(errorHandler);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

after(() => { server.close(); });

test("épico é baixado como text/markdown com Content-Disposition de anexo", async () => {
  const response = await fetch(`${baseUrl}/epics/${EPIC}/export/markdown`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/markdown; charset=utf-8/);
  assert.equal(
    response.headers.get("content-disposition"),
    `attachment; filename="EP-01-especificar-o-backlog.md"; filename*=UTF-8''EP-01-especificar-o-backlog.md`,
  );
  const body = await response.text();
  assert.ok(body.startsWith("# EP-01 \u2014 Especificar o backlog"));
  assert.ok(body.includes("### PBI-01.1.5 \u2014 Exportar especificação · `Could`"));
});

test("feature é exportada isolada e qualquer perfil com acesso ao projeto pode baixar", async () => {
  const response = await fetch(`${baseUrl}/features/${FEATURE}/export/markdown`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition") ?? "", /filename="FT-01\.1-rastreabilidade-das-decisoes\.md"/);
  const body = await response.text();
  assert.ok(body.startsWith("**Épico de origem:** EP-01 \u2014 Especificar o backlog\n\n## FT-01.1"));
  assert.ok(!body.includes("## Descrição"));
});

test("sem autenticação, sem acesso ao projeto, inexistente, ID inválido e arquivado", async () => {
  authenticated = false;
  assert.equal((await fetch(`${baseUrl}/epics/${EPIC}/export/markdown`)).status, 401);
  authenticated = true;
  assert.equal((await fetch(`${baseUrl}/epics/${FOREIGN_EPIC}/export/markdown`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/epics/${MISSING}/export/markdown`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/features/${MISSING}/export/markdown`)).status, 404);
  const archived = await fetch(`${baseUrl}/epics/${ARCHIVED_EPIC}/export/markdown`);
  assert.equal(archived.status, 409);
  assert.equal(((await archived.json()) as { error: string }).error, "Itens arquivados não podem ser exportados.");
});

test("serviço recusa feature cujo épico ou projeto está arquivado", async () => {
  const base = await new FakeReader().loadFeature(FEATURE);
  for (const record of [
    { ...base!, epic: { ...base!.epic, status: "arquivado" } },
    { ...base!, projeto_status: "arquivado" },
    { ...base!, feature: { ...base!.feature, status: "arquivado" } },
  ]) {
    const service = new BacklogExportService({ loadEpic: async () => null, loadFeature: async () => record });
    await assert.rejects(service.exportFeature(FEATURE), { statusCode: 409 });
  }
  const service = new BacklogExportService(new FakeReader());
  await assert.rejects(service.exportEpic("nao-e-uuid"), { statusCode: 400 });
});
