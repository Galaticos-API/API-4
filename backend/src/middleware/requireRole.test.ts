import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { requireRole } from "./requireRole.js";
import { UserRole } from "../modules/auth/auth.types.js";

test("escrita de projetos exige sessão e perfil PO ou administrador", async () => {
  let role: UserRole | undefined;
  const app = express();
  app.use((req, _res, next) => {
    if (role) req.auth = { id: "user", nome: "Pessoa", email: "test@example.com", role };
    next();
  });
  app.post("/projects", requireRole("admin", "po"), (_req, res) => { res.sendStatus(201); });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    for (const [profile, expected] of [[undefined, 401], ["dev", 403], ["po", 201], ["admin", 201]] as const) {
      role = profile;
      const result = await fetch(`http://127.0.0.1:${address.port}/projects`, { method: "POST" });
      assert.equal(result.status, expected, `perfil ${profile}`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
