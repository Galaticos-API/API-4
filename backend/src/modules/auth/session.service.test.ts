import test from "node:test";
import assert from "node:assert/strict";

import { SessionService } from "./session.service.js";
import {
  SessionRecord,
  SessionWithUser,
} from "./auth.types.js";

class MockSessionRepository {
  public session: SessionWithUser | null = null;
  public storedTokenHash: string | null = null;
  public touched = false;
  public revoked = false;

  async createSession(
    userId: string,
    tokenHash: string,
  ): Promise<SessionRecord> {
    this.storedTokenHash = tokenHash;

    return {
      id: "session-1",
      usuario_id: userId,
      token_hash: tokenHash,
      created_at: new Date(),
      ultima_atividade_em: new Date(),
      revogada_em: null,
    };
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<SessionWithUser | null> {
    this.storedTokenHash = tokenHash;
    return this.session;
  }

  async touchSession(): Promise<void> {
    this.touched = true;
  }

  async revokeSessionByTokenHash(): Promise<void> {
    this.revoked = true;
  }
}

function createValidSession(
  now: Date,
): SessionWithUser {
  return {
    id: "session-1",
    usuario_id: "user-1",
    token_hash: "hash",
    created_at: new Date(now.getTime() - 60_000),
    ultima_atividade_em: new Date(now.getTime() - 30_000),
    revogada_em: null,
    nome: "Usuário Teste",
    email: "teste@example.com",
    role: "po",
    ativo: true,
  };
}

test("deve criar token e armazenar apenas seu hash", async () => {
  const repository = new MockSessionRepository();
  const service = new SessionService(repository);

  const result = await service.createSession("user-1");

  assert.ok(result.token.length > 0);
  assert.ok(repository.storedTokenHash);
  assert.notEqual(repository.storedTokenHash, result.token);
  assert.equal(repository.storedTokenHash?.length, 64);
});

test("deve validar sessão ativa", async () => {
  const now = new Date();
  const repository = new MockSessionRepository();

  repository.session = createValidSession(now);

  const service = new SessionService(
    repository,
    () => now,
  );

  const result = await service.validateSession("token-valido");

  assert.equal(result.valid, true);
  assert.equal(repository.touched, true);

  if (result.valid) {
    assert.equal(result.user.id, "user-1");
    assert.equal(result.user.role, "po");
  }
});

test("deve rejeitar sessão revogada", async () => {
  const now = new Date();
  const repository = new MockSessionRepository();

  repository.session = {
    ...createValidSession(now),
    revogada_em: new Date(),
  };

  const service = new SessionService(
    repository,
    () => now,
  );

  const result = await service.validateSession("token");

  assert.equal(result.valid, false);

  if (!result.valid) {
    assert.equal(result.reason, "revoked");
  }
});

test("deve rejeitar e revogar sessão de usuário inativo", async () => {
  const now = new Date();
  const repository = new MockSessionRepository();

  repository.session = {
    ...createValidSession(now),
    ativo: false,
  };

  const service = new SessionService(
    repository,
    () => now,
  );

  const result = await service.validateSession("token");

  assert.equal(result.valid, false);
  assert.equal(repository.revoked, true);

  if (!result.valid) {
    assert.equal(result.reason, "inactive_user");
  }
});

test("deve revogar sessão expirada por inatividade", async () => {
  const now = new Date();
  const repository = new MockSessionRepository();

  repository.session = {
    ...createValidSession(now),
    ultima_atividade_em: new Date(
      now.getTime() - 31 * 60 * 1000,
    ),
  };

  const service = new SessionService(
    repository,
    () => now,
  );

  const result = await service.validateSession("token");

  assert.equal(result.valid, false);
  assert.equal(repository.revoked, true);

  if (!result.valid) {
    assert.equal(result.reason, "idle_expired");
  }
});

test("deve permitir revogar uma sessão manualmente", async () => {
  const repository = new MockSessionRepository();
  const service = new SessionService(repository);

  await service.revokeSession("token");

  assert.equal(repository.revoked, true);
});