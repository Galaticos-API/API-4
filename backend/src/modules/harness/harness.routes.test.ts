import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  createHarnessAdminRouter,
  createHarnessRunRouter,
} from "./harness.routes.js";
import { HarnessService } from "./harness.service.js";
import { defaultConfig } from "./harness.contract.js";
import { errorHandler } from "../../middleware/errorHandler.js";

test("admin exige autenticação e perfil; execução recusa contexto fornecido pelo cliente", async () => {
  const service = {
    async current() {
      return {
        mode: "consulta",
        version: 0,
        schema_version: 1,
        config: defaultConfig("consulta"),
      };
    },
  } as unknown as HarnessService;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers["x-role"])
      req.auth = {
        id: "60000000-0000-4000-8000-000000000001",
        role: req.headers["x-role"] as "admin",
        nome: "Teste",
        email: "test@example.test",
      };
    next();
  });
  app.use(
    "/admin",
    createHarnessAdminRouter(service, (_req, _res, next) => next()),
  );
  app.use(
    "/run",
    createHarnessRunRouter(service, (_req, _res, next) => next()),
  );
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const url = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  try {
    assert.equal((await fetch(url + "/admin/consulta")).status, 401);
    assert.equal(
      (await fetch(url + "/admin/consulta", { headers: { "x-role": "po" } }))
        .status,
      403,
    );
    assert.equal(
      (await fetch(url + "/admin/consulta", { headers: { "x-role": "admin" } }))
        .status,
      200,
    );
    assert.equal(
      (await fetch(url + "/admin/invalido", { headers: { "x-role": "admin" } }))
        .status,
      400,
    );
    assert.equal(
      (
        await fetch(url + "/admin/consulta/history?before=-1", {
          headers: { "x-role": "admin" },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(url + "/run", {
          method: "POST",
          headers: { "x-role": "dev", "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(url + "/run", {
          method: "POST",
          headers: { "x-role": "po", "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "consulta",
            operation: "responder",
            fields: { pergunta: "Pedido" },
            context: [],
          }),
        })
      ).status,
      400,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
