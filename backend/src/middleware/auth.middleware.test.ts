import test from "node:test";
import assert from "node:assert/strict";
import { Request, Response } from "express";
import { requireAuth, requireRole, normalizeRole } from "./auth.middleware.js";
import { UnauthorizedError, ForbiddenError } from "../modules/projects/projects.service.js";

function createMockReq(headers: Record<string, string> = {}, user?: any): Partial<Request> {
  return {
    headers: { ...headers },
    user,
  };
}

function createMockRes(): Partial<Response> {
  return {};
}

test("normalizeRole normaliza variações de nomes de papéis", () => {
  assert.equal(normalizeRole("PO"), "po");
  assert.equal(normalizeRole("Product Owner"), "po");
  assert.equal(normalizeRole("product_owner"), "po");
  assert.equal(normalizeRole("product-owner"), "po");
  assert.equal(normalizeRole("admin"), "admin");
  assert.equal(normalizeRole("ADMIN"), "admin");
  assert.equal(normalizeRole("administrador"), "admin");
  assert.equal(normalizeRole("dev"), "dev");
  assert.equal(normalizeRole("DEV"), "dev");
  assert.equal(normalizeRole("desenvolvedor"), "dev");
  assert.equal(normalizeRole("developer"), "dev");
  assert.equal(normalizeRole(""), "");
  assert.equal(normalizeRole(undefined), "");
});

test("requireAuth autentica requisição com x-user-id e x-user-role", () => {
  const req = createMockReq({
    "x-user-id": "user-123",
    "x-user-role": "dev",
  }) as Request;
  const res = createMockRes() as Response;

  let nextCalled = false;
  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.ok(nextCalled);
  assert.deepEqual(req.user, {
    id: "user-123",
    role: "dev",
  });
});

test("requireAuth autentica requisição com Authorization Bearer token", () => {
  const req = createMockReq({
    authorization: "Bearer user-token-abc",
  }) as Request;
  const res = createMockRes() as Response;

  let nextCalled = false;
  requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.ok(nextCalled);
  assert.equal(req.user?.id, "user-token-abc");
  assert.equal(req.user?.role, "po");
});

test("requireAuth lança UnauthorizedError quando não há credenciais", () => {
  const req = createMockReq({}) as Request;
  const res = createMockRes() as Response;

  assert.throws(
    () => {
      requireAuth(req, res, () => {});
    },
    (err: Error) => {
      assert.ok(err instanceof UnauthorizedError);
      assert.equal(err.statusCode, 401);
      return true;
    },
  );
});

test("requireRole permite acesso quando o papel do usuário é permitido", () => {
  const req = createMockReq(
    {},
    { id: "user-1", role: "po" },
  ) as Request;
  const res = createMockRes() as Response;

  const middleware = requireRole("po", "admin");
  let nextArg: unknown = undefined;
  middleware(req, res, (arg) => {
    nextArg = arg;
  });

  assert.equal(nextArg, undefined);
});

test("requireRole bloqueia com ForbiddenError (403) quando o papel não é permitido", () => {
  const req = createMockReq(
    {},
    { id: "user-1", role: "dev" },
  ) as Request;
  const res = createMockRes() as Response;

  const middleware = requireRole("po", "admin");
  let errorReceived: unknown = undefined;
  middleware(req, res, (err) => {
    errorReceived = err;
  });

  assert.ok(errorReceived instanceof ForbiddenError);
  assert.equal((errorReceived as ForbiddenError).statusCode, 403);
});
