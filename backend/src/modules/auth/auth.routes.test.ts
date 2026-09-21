import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";

import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { hashPassword } from "./pssword.service.js";
import { SessionService } from "./session.service.js";
import { createRequireAuth } from "../../middleware/requireAuth.js";
import {
  SessionRecord,
  SessionWithUser,
  UserRecord,
} from "./auth.types.js";

class MockAuthRepository {
  public user: UserRecord | null = null;
  public failedLoginCalls = 0;
  public resetCalls = 0;

  async createUser(data: {
    nome: string;
    email: string;
    senha_hash: string;
    role?: UserRecord["role"];
  }): Promise<UserRecord> {
    this.user = {
      id: "new-user-id",
      nome: data.nome,
      email: data.email,
      senha_hash: data.senha_hash,
      role: data.role ?? "po",
      ativo: true,
      tentativas_login: 0,
      bloqueado_ate: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    return this.user;
  }

  async findUserByEmail(
    _email: string,
  ): Promise<UserRecord | null> {
    return this.user;
  }

  async recordFailedLogin(): Promise<UserRecord | null> {
    this.failedLoginCalls += 1;

    if (this.user) {
      this.user = {
        ...this.user,
        tentativas_login:
          this.user.tentativas_login + 1,
      };
    }

    return this.user;
  }

  async resetLoginAttempts(): Promise<void> {
    this.resetCalls += 1;

    if (this.user) {
      this.user = {
        ...this.user,
        tentativas_login: 0,
        bloqueado_ate: null,
      };
    }
  }
}

class MockSessionRepository {
  public session: SessionRecord | null = null;
  public user: UserRecord | null = null;

  async createSession(
    userId: string,
    tokenHash: string,
  ): Promise<SessionRecord> {
    this.session = {
      id: "session-1",
      usuario_id: userId,
      token_hash: tokenHash,
      created_at: new Date(),
      ultima_atividade_em: new Date(),
      revogada_em: null,
    };

    return this.session;
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<SessionWithUser | null> {
    if (
      !this.session ||
      !this.user ||
      this.session.token_hash !== tokenHash
    ) {
      return null;
    }

    return {
      ...this.session,
      nome: this.user.nome,
      email: this.user.email,
      role: this.user.role,
      ativo: this.user.ativo,
    };
  }

  async touchSession(
    _sessionId: string,
  ): Promise<void> {
    if (this.session) {
      this.session = {
        ...this.session,
        ultima_atividade_em: new Date(),
      };
    }
  }

  async revokeSessionByTokenHash(
    tokenHash: string,
  ): Promise<void> {
    if (
      this.session &&
      this.session.token_hash === tokenHash
    ) {
      this.session = {
        ...this.session,
        revogada_em: new Date(),
      };
    }
  }
}

async function createUser(
  overrides: Partial<UserRecord> = {},
): Promise<UserRecord> {
  return {
    id: "user-1",
    nome: "Usuário Teste",
    email: "usuario@example.com",
    senha_hash: await hashPassword(
      "SenhaCorreta123!",
    ),
    role: "po",
    ativo: true,
    tentativas_login: 0,
    bloqueado_ate: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

test("Testes HTTP - Autenticação e sessão", async (t) => {
  const authRepository = new MockAuthRepository();
  const sessionRepository =
    new MockSessionRepository();

  const sessions = new SessionService(
    sessionRepository,
  );

  const authService = new AuthService(
    authRepository,
    sessions,
  );

  const controller = new AuthController(
    authService,
    sessions,
  );

  const requireAuth =
    createRequireAuth(sessions);

  const app = express();

  app.use(express.json());

  app.post(
    "/api/v1/auth/register",
    controller.register,
  );

  app.post(
    "/api/v1/auth/login",
    controller.login,
  );

  app.get(
    "/api/v1/auth/me",
    requireAuth,
    controller.me,
  );

  app.post(
    "/api/v1/auth/logout",
    requireAuth,
    controller.logout,
  );

  let server: Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(
        0,
        "127.0.0.1",
        () => {
          const address =
            server.address() as AddressInfo;

          baseUrl =
            `http://127.0.0.1:${address.port}`;

          resolve();
        },
      );
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  await t.test(
    "credenciais inexistentes e senha incorreta retornam a mesma resposta",
    async () => {
      authRepository.user = null;

      const nonexistent = await fetch(
        `${baseUrl}/api/v1/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "naoexiste@example.com",
            password: "SenhaErrada123!",
          }),
        },
      );

      authRepository.user =
        await createUser();

      const wrongPassword = await fetch(
        `${baseUrl}/api/v1/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "usuario@example.com",
            password: "SenhaErrada123!",
          }),
        },
      );

      assert.equal(
        nonexistent.status,
        401,
      );

      assert.equal(
        wrongPassword.status,
        401,
      );

      const nonexistentBody =
        await nonexistent.json() as {
          error: string;
          code: string;
        };

      const wrongPasswordBody =
        await wrongPassword.json() as {
          error: string;
          code: string;
        };

      assert.deepEqual(
        nonexistentBody,
        wrongPasswordBody,
      );

      assert.equal(
        nonexistentBody.code,
        "INVALID_CREDENTIALS",
      );
    },
  );

  await t.test(
    "usuário inativo não consegue autenticar",
    async () => {
      authRepository.user =
        await createUser({
          ativo: false,
        });

      const response = await fetch(
        `${baseUrl}/api/v1/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email:
              "usuario@example.com",
            password:
              "SenhaCorreta123!",
          }),
        },
      );

      assert.equal(response.status, 403);

      const body =
        await response.json() as {
          code: string;
        };

      assert.equal(
        body.code,
        "USER_INACTIVE",
      );
    },
  );

  await t.test(
    "login cria cookie HttpOnly e permite consultar /me",
    async () => {
      const user = await createUser();

      authRepository.user = user;
      sessionRepository.user = user;

      const loginResponse = await fetch(
        `${baseUrl}/api/v1/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            email:
              "usuario@example.com",
            password:
              "SenhaCorreta123!",
          }),
        },
      );

      assert.equal(
        loginResponse.status,
        200,
      );

      const setCookie =
        loginResponse.headers.get(
          "set-cookie",
        );

      assert.ok(setCookie);

      assert.match(
        setCookie,
        /sinapse_session=/,
      );

      assert.match(
        setCookie,
        /HttpOnly/i,
      );

      const loginBody =
        await loginResponse.json() as {
          user: {
            id: string;
            email: string;
            role: string;
          };
          token?: string;
        };

      assert.equal(
        loginBody.user.id,
        "user-1",
      );

      assert.ok(loginBody.token);

      const cookie =
        setCookie.split(";")[0];

      const meResponse = await fetch(
        `${baseUrl}/api/v1/auth/me`,
        {
          headers: {
            Cookie: cookie,
          },
        },
      );

      assert.equal(
        meResponse.status,
        200,
      );

      const meBody =
        await meResponse.json() as {
          user: {
            id: string;
            email: string;
            role: string;
          };
        };

      assert.equal(
        meBody.user.id,
        "user-1",
      );

      assert.equal(
        meBody.user.email,
        "usuario@example.com",
      );

      assert.equal(
        meBody.user.role,
        "po",
      );

      const logoutResponse =
        await fetch(
          `${baseUrl}/api/v1/auth/logout`,
          {
            method: "POST",
            headers: {
              Cookie: cookie,
            },
          },
        );

      assert.equal(
        logoutResponse.status,
        204,
      );

      const afterLogout =
        await fetch(
          `${baseUrl}/api/v1/auth/me`,
          {
            headers: {
              Cookie: cookie,
            },
          },
        );

      assert.equal(
        afterLogout.status,
        401,
      );
    },
  );

  await t.test(
    "registro de usuário cria conta e retorna status 201 com token",
    async () => {
      authRepository.user = null;

      // Mock para createUser no repo
      (authRepository as any).createUser = async (data: any) => {
        authRepository.user = {
          id: "new-user-id",
          nome: data.nome,
          email: data.email,
          senha_hash: data.senha_hash,
          role: data.role ?? "po",
          ativo: true,
          tentativas_login: 0,
          bloqueado_ate: null,
          created_at: new Date(),
          updated_at: new Date(),
        };
        return authRepository.user;
      };

      authRepository.user = null;

      const registerResponse = await fetch(
        `${baseUrl}/api/v1/auth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nome: "Novo Usuário",
            email: "novo@example.com",
            password: "SenhaSegura123!",
            role: "dev",
          }),
        },
      );

      assert.equal(registerResponse.status, 201);

      const regBody = (await registerResponse.json()) as {
        user: { id: string; email: string; role: string };
        token: string;
      };

      assert.equal(regBody.user.email, "novo@example.com");
      assert.equal(regBody.user.role, "dev");
      assert.ok(regBody.token);
    },
  );
});