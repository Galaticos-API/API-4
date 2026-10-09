import test from "node:test";
import assert from "node:assert/strict";
import express, { type RequestHandler, type Router } from "express";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { createAdminRouter } from "./admin/admin.routes.js";
import { AdminController } from "./admin/admin.controller.js";
import { AdminService } from "./admin/admin.service.js";
import { createSearchRouter } from "./search/search.routes.js";
import { SearchController } from "./search/search.controller.js";
import { SearchService } from "./search/search.service.js";
import { SearchRepository } from "./search/search.repository.js";
import { createDevelopersRouter } from "./developers/developers.routes.js";
import { DevelopersController } from "./developers/developers.controller.js";
import { DevelopersService } from "./developers/developers.service.js";
import { errorHandler } from "../middleware/errorHandler.js";

const authenticate: RequestHandler = (req, res, next) => {
  const role = req.headers["x-role"];
  if (role !== "admin" && role !== "po" && role !== "dev") {
    res.status(401).json({ code: "UNAUTHORIZED" });
    return;
  }
  req.auth = { id: "user", nome: "Teste", email: "teste@example.com", role };
  next();
};

async function withRouter(router: Router, run: (url: string) => Promise<void>) {
  const app = express();
  app.use(express.json(), router, errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try { await run("http://127.0.0.1:" + (server.address() as AddressInfo).port); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

const projectId = "a0000000-0000-4000-8000-000000000001";

test("admin mantém permissões, estatísticas e o contrato da carga sem projeto", async () => {
  let calls = 0;
  const inserted: string[] = [];
  const counts = { projetos: 1, epicos: 2, features: 3, pbis: 4, documentos: 5, chunksIndexados: 6 };
  const service = new AdminService({
    async counts() { calls++; return counts; },
    async insertDemoChunks(id) { inserted.push(id); return 2; },
  });
  await withRouter(createAdminRouter(new AdminController(service), authenticate), async url => {
    assert.equal((await fetch(url + "/stats")).status, 401);
    for (const role of ["dev", "po"]) {
      assert.equal((await fetch(url + "/stats", { headers: { "x-role": role } })).status, 403);
      assert.equal((await fetch(url + "/ingest-seed", { method: "POST", headers: { "x-role": role } })).status, 403);
    }
    assert.equal(calls, 0);
    const headers = { "x-role": "admin" };
    assert.deepEqual(await (await fetch(url + "/stats", { headers })).json(), { ...counts, statusSistema: "operacional" });
    const empty = await fetch(url + "/ingest-seed", { method: "POST", headers });
    assert.equal(empty.status, 400);
    assert.equal((await empty.json() as { code: string }).code, "VALIDATION_ERROR");
    assert.deepEqual(inserted, []);
    const seeded = await fetch(url + "/demo-seed", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ projeto_id: projectId }) });
    assert.equal(seeded.status, 200);
    assert.equal(((await seeded.json()) as { status: string }).status, "sucesso");
    assert.deepEqual(inserted, [projectId]);
  });
});

test("busca rejeita arrays/objetos, valida UUID e preserva aliases e parâmetros SQL", async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = { async query(sql: string, params: unknown[]) {
    queries.push({ sql, params }); return { rows: [], rowCount: 0 };
  } } as unknown as Pick<Pool, "query">;
  const controller = new SearchController(new SearchService(new SearchRepository(db)));
  await withRouter(createSearchRouter(controller, authenticate), async url => {
    const headers = { "x-role": "po" };
    assert.equal((await fetch(url)).status, 401);
    for (const query of ["q=a&q=b", "q[x]=a", "projeto_id=bad", "projectId[]=bad", "q=" + "a".repeat(201)]) {
      assert.equal((await fetch(url + "?" + query, { headers })).status, 400, query);
    }
    assert.equal(queries.length, 0);
    for (const alias of ["projectId", "projeto_id"]) {
      const response = await fetch(url + "?q=100%25_test&" + alias + "=" + projectId, { headers });
      assert.deepEqual(await response.json(), { items: [], total: 0 });
      assert.deepEqual(queries.at(-1)?.params, ["user", "%100\\%\\_test%", projectId]);
      assert.match(queries.at(-1)!.sql, /c.projeto_id = \$3/);
    }
    await fetch(url + "?projeto_id=" + projectId, { headers });
    assert.deepEqual(queries.at(-1)?.params, ["user", projectId]);
    assert.match(queries.at(-1)!.sql, /c.projeto_id = \$2/);
    await fetch(url, { headers });
    assert.deepEqual(queries.at(-1)?.params, ["user"]);
    assert.match(queries.at(-1)!.sql, /access_user.id=\$1/);
  });
});

test("desenvolvedores preserva o formato e encaminha erros ao handler global", async () => {
  let fail = false;
  const service = new DevelopersService({
    async listDevelopers() { if (fail) throw new Error("internal database detail"); return []; },
    async listTechnologies() { return [{ id: "tech", nome: "React", categoria: "frontend" }]; },
    async listCompetencies() { return []; },
  });
  await withRouter(createDevelopersRouter(new DevelopersController(service), authenticate), async url => {
    assert.equal((await fetch(url)).status, 401);
    const headers = { "x-role": "dev" };
    const response = await fetch(url, { headers });
    assert.deepEqual(await response.json(), { desenvolvedores: [], tecnologias: [{ id: "tech", nome: "React", categoria: "frontend" }], competencias: [] });
    fail = true;
    const error = await fetch(url, { headers });
    assert.equal(error.status, 500);
    assert.doesNotMatch(await error.text(), /internal database detail/);
  });
});
