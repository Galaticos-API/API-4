import test from "node:test";
import assert from "node:assert/strict";
import express, { type RequestHandler } from "express";
import { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createAdminRouter } from "./admin.routes.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { IngestionObservabilityRepository, type IngestionSnapshot } from "./ingestion-observability.js";
import { errorHandler } from "../../middleware/errorHandler.js";

class FakeAdminService extends AdminService {
  constructor() {
    super({
      async counts() {
        return { projetos: 0, epicos: 0, features: 0, pbis: 0, documentos: 0, chunksIndexados: 0 };
      },
      async insertDemoChunks() { return 0; },
    });
  }
}

class FakeIngestionRepository extends IngestionObservabilityRepository {
  public lastLimit: number | null = null;
  public response: IngestionSnapshot = {
    counts: { pendente: 1, processando: 2, processado: 3, falha: 4 },
    recent: [],
    active: [],
    failed: [],
    generated_at: "2026-10-09T00:00:00.000Z",
  };
  async snapshot(limit = 25): Promise<IngestionSnapshot> {
    this.lastLimit = limit;
    return this.response;
  }
}

const auth: RequestHandler = (req, res, next) => {
  const role = req.headers["x-role"];
  if (role !== "admin" && role !== "po" && role !== "dev") {
    res.status(401).json({ code: "UNAUTHORIZED" });
    return;
  }
  req.auth = { id: "user", nome: "Teste", email: "teste@example.com", role };
  next();
};

async function withServer(repository: FakeIngestionRepository, run: (base: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  const controller = new AdminController(new FakeAdminService(), repository);
  app.use("/admin", createAdminRouter(controller, auth));
  app.use(errorHandler);
  let server!: Server;
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin`;
  try { await run(base); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("ingestion observability: exige admin", async () => {
  await withServer(new FakeIngestionRepository(), async (base) => {
    assert.equal((await fetch(`${base}/ingestion`)).status, 401);
    assert.equal((await fetch(`${base}/ingestion`, { headers: { "x-role": "po" } })).status, 403);
    assert.equal((await fetch(`${base}/ingestion`, { headers: { "x-role": "dev" } })).status, 403);
  });
});

test("ingestion observability: devolve o snapshot com contagens e listas", async () => {
  const repo = new FakeIngestionRepository();
  await withServer(repo, async (base) => {
    const res = await fetch(`${base}/ingestion`, { headers: { "x-role": "admin" } });
    assert.equal(res.status, 200);
    const body = await res.json() as IngestionSnapshot;
    assert.deepEqual(body.counts, { pendente: 1, processando: 2, processado: 3, falha: 4 });
    assert.equal(body.generated_at, "2026-10-09T00:00:00.000Z");
    assert.equal(repo.lastLimit, 25);
  });
});

test("ingestion observability: aceita limit customizado dentro de [1,100]", async () => {
  const repo = new FakeIngestionRepository();
  await withServer(repo, async (base) => {
    await fetch(`${base}/ingestion?limit=50`, { headers: { "x-role": "admin" } });
    assert.equal(repo.lastLimit, 50);
    await fetch(`${base}/ingestion?limit=999`, { headers: { "x-role": "admin" } });
    assert.equal(repo.lastLimit, 25, "limit fora da faixa deve cair no default");
    await fetch(`${base}/ingestion?limit=abc`, { headers: { "x-role": "admin" } });
    assert.equal(repo.lastLimit, 25, "limit nao numerico deve cair no default");
  });
});
