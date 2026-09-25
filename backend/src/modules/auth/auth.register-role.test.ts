import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { SessionService } from "./session.service.js";
import type { UserRole } from "./auth.types.js";

class FakeAuthService extends AuthService {
  public registered: Array<{ email: string; role: UserRole }> = [];

  async register(data: { nome: string; email: string; password: string; role: UserRole }) {
    this.registered.push({ email: data.email, role: data.role });
    return {
      success: true as const,
      token: "novo-token",
      user: { id: "u-new", nome: data.nome, email: data.email, role: data.role },
    };
  }
}

class FakeSessions extends SessionService {
  private readonly roles = new Map<string, UserRole>([["token-admin", "admin"], ["token-po", "po"], ["token-dev", "dev"]]);

  async validateSession(token: string) {
    const role = this.roles.get(token);
    if (!role) return { valid: false as const, reason: "not_found" as const };
    return { valid: true as const, user: { id: `id-${role}`, nome: role, email: `${role}@example.com`, role } } as never;
  }
}

const service = new FakeAuthService();
let server: Server;
let baseUrl: string;

before(() => {
  const app = express();
  app.use(express.json());
  app.post("/register", new AuthController(service, new FakeSessions()).register);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

const register = (role: string | undefined, token?: string) =>
  fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ nome: "Pessoa Teste", email: `${role ?? "padrao"}@example.com`, password: "SenhaSegura123!", ...(role ? { role } : {}) }),
  });

test("cadastro público não concede administrador", async () => {
  const response = await register("admin");
  assert.equal(response.status, 403);
  assert.equal(((await response.json()) as { code: string }).code, "FORBIDDEN");
  assert.equal(service.registered.length, 0);
});

test("sessões de PO, dev, token inválido e cookie ausente também não criam administrador", async () => {
  for (const token of ["token-po", "token-dev", "token-invalido"]) {
    assert.equal((await register("admin", token)).status, 403, token);
  }
  assert.equal(service.registered.length, 0);
});

test("somente uma sessão de administrador cria outra conta de administrador", async () => {
  const response = await register("admin", "token-admin");
  assert.equal(response.status, 201);
  assert.deepEqual(service.registered.at(-1), { email: "admin@example.com", role: "admin" });
});

test("cadastro público de PO, dev e do perfil padrão continua permitido", async () => {
  assert.equal((await register("po")).status, 201);
  assert.equal((await register("dev")).status, 201);
  assert.equal((await register(undefined)).status, 201);
  assert.deepEqual(service.registered.map((item) => item.role).slice(-3), ["po", "dev", "po"]);
});

test("perfil inválido é recusado com 400", async () => {
  assert.equal((await register("superuser")).status, 400);
});
