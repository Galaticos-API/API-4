import test from "node:test";
import assert from "node:assert/strict";

import { AuthService } from "./auth.service.js";
import { hashPassword } from "./pssword.service.js";
import {
  SessionRecord,
  UserRecord,
} from "./auth.types.js";

class MockAuthRepository {
  public user: UserRecord | null = null;

  public failedLoginCalls = 0;
  public resetCalls = 0;

  public failedLoginResult: UserRecord | null = null;

  async findUserByEmail(): Promise<UserRecord | null> {
    return this.user;
  }

  async recordFailedLogin(): Promise<UserRecord | null> {
    this.failedLoginCalls += 1;

    return this.failedLoginResult ?? this.user;
  }

  async resetLoginAttempts(): Promise<void> {
    this.resetCalls += 1;
  }
}

class MockSessionService {
  public createCalls = 0;

  async createSession(
    userId: string,
  ): Promise<{
    token: string;
    session: SessionRecord;
  }> {
    this.createCalls += 1;

    return {
      token: "token-seguro",
      session: {
        id: "session-1",
        usuario_id: userId,
        token_hash: "hash",
        created_at: new Date(),
        ultima_atividade_em: new Date(),
        revogada_em: null,
      },
    };
  }
}

async function createUser(
  overrides: Partial<UserRecord> = {},
): Promise<UserRecord> {
  return {
    id: "user-1",
    nome: "Usuário Teste",
    email: "usuario@example.com",
    senha_hash: await hashPassword("SenhaCorreta123!"),
    role: "po",
    ativo: true,
    tentativas_login: 0,
    bloqueado_ate: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

test("deve autenticar usuário ativo com credenciais válidas", async () => {
  const repository = new MockAuthRepository();
  const sessions = new MockSessionService();

  repository.user = await createUser();

  const service = new AuthService(
    repository,
    sessions,
  );

  const result = await service.login({
    email: "usuario@example.com",
    password: "SenhaCorreta123!",
  });

  assert.equal(result.success, true);
  assert.equal(repository.resetCalls, 1);
  assert.equal(sessions.createCalls, 1);

  if (result.success) {
    assert.equal(result.token, "token-seguro");
    assert.equal(result.user.id, "user-1");
    assert.equal(result.user.role, "po");
  }
});

test("deve retornar erro genérico para usuário inexistente", async () => {
  const repository = new MockAuthRepository();
  const sessions = new MockSessionService();

  const service = new AuthService(
    repository,
    sessions,
  );

  const result = await service.login({
    email: "naoexiste@example.com",
    password: "SenhaQualquer123!",
  });

  assert.equal(result.success, false);

  if (!result.success) {
    assert.equal(
      result.reason,
      "invalid_credentials",
    );
  }

  assert.equal(sessions.createCalls, 0);
});

test("deve rejeitar senha incorreta com mensagem genérica", async () => {
  const repository = new MockAuthRepository();
  const sessions = new MockSessionService();

  repository.user = await createUser();

  const service = new AuthService(
    repository,
    sessions,
  );

  const result = await service.login({
    email: "usuario@example.com",
    password: "SenhaErrada123!",
  });

  assert.equal(result.success, false);
  assert.equal(repository.failedLoginCalls, 1);
  assert.equal(sessions.createCalls, 0);

  if (!result.success) {
    assert.equal(
      result.reason,
      "invalid_credentials",
    );
  }
});

test("deve recusar usuário inativo mesmo com senha correta", async () => {
  const repository = new MockAuthRepository();
  const sessions = new MockSessionService();

  repository.user = await createUser({
    ativo: false,
  });

  const service = new AuthService(
    repository,
    sessions,
  );

  const result = await service.login({
    email: "usuario@example.com",
    password: "SenhaCorreta123!",
  });

  assert.equal(result.success, false);
  assert.equal(sessions.createCalls, 0);

  if (!result.success) {
    assert.equal(
      result.reason,
      "inactive_user",
    );
  }
});

test("deve bloquear login durante período de bloqueio", async () => {
  const now = new Date();

  const repository = new MockAuthRepository();
  const sessions = new MockSessionService();

  repository.user = await createUser({
    tentativas_login: 5,
    bloqueado_ate: new Date(
      now.getTime() + 10 * 60 * 1000,
    ),
  });

  const service = new AuthService(
    repository,
    sessions,
    () => now,
  );

  const result = await service.login({
    email: "usuario@example.com",
    password: "SenhaCorreta123!",
  });

  assert.equal(result.success, false);
  assert.equal(sessions.createCalls, 0);

  if (!result.success) {
    assert.equal(
      result.reason,
      "temporarily_locked",
    );
  }
});

test("deve liberar nova tentativa após expiração do bloqueio", async () => {
  const now = new Date();

  const repository = new MockAuthRepository();
  const sessions = new MockSessionService();

  repository.user = await createUser({
    tentativas_login: 5,
    bloqueado_ate: new Date(
      now.getTime() - 60_000,
    ),
  });

  const service = new AuthService(
    repository,
    sessions,
    () => now,
  );

  const result = await service.login({
    email: "usuario@example.com",
    password: "SenhaCorreta123!",
  });

  assert.equal(result.success, true);

  // Um reset quando detecta bloqueio expirado
  // e outro após autenticação bem-sucedida.
  assert.equal(repository.resetCalls, 2);

  assert.equal(sessions.createCalls, 1);
});

test("deve bloquear ao atingir o limite de tentativas inválidas", async () => {
  const now = new Date();

  const repository = new MockAuthRepository();
  const sessions = new MockSessionService();

  repository.user = await createUser({
    tentativas_login: 4,
  });

  repository.failedLoginResult = {
    ...repository.user,
    tentativas_login: 5,
    bloqueado_ate: new Date(
      now.getTime() + 15 * 60 * 1000,
    ),
  };

  const service = new AuthService(
    repository,
    sessions,
    () => now,
  );

  const result = await service.login({
    email: "usuario@example.com",
    password: "SenhaErrada123!",
  });

  assert.equal(result.success, false);

  if (!result.success) {
    assert.equal(
      result.reason,
      "temporarily_locked",
    );
  }
});