import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { AddressInfo } from "node:net";
import { Server } from "node:http";

import { createRequireAuth } from "./requireAuth.js";
import { SessionService } from "../modules/auth/session.service.js";
import {
  SessionRecord,
  SessionWithUser,
} from "../modules/auth/auth.types.js";

class MockSessionRepository {
  public session: SessionWithUser | null = null;

  async createSession(
    userId: string,
    tokenHash: string,
  ): Promise<SessionRecord> {
    return {
      id: "session-1",
      usuario_id: userId,
      token_hash: tokenHash,
      created_at: new Date(),
      ultima_atividade_em: new Date(),
      revogada_em: null,
    };
  }

  async findSessionByTokenHash(): Promise<SessionWithUser | null> {
    return this.session;
  }

  async touchSession(): Promise<void> {}

  async revokeSessionByTokenHash(): Promise<void> {}
}

test("requireAuth protege rotas privadas", async (t) => {
  const repository = new MockSessionRepository();

  const sessionService = new SessionService(repository);

  const app = express();

  app.get(
    "/private",
    createRequireAuth(sessionService),
    (req, res) => {
      res.status(200).json({
        user: req.auth,
      });
    },
  );

  let server: Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const address = server.address() as AddressInfo;

        baseUrl =
          `http://127.0.0.1:${address.port}/private`;

        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  await t.test(
    "deve retornar 401 sem cookie de sessão",
    async () => {
      const response = await fetch(baseUrl);

      assert.equal(response.status, 401);

      const body = await response.json() as {
        code: string;
      };

      assert.equal(body.code, "UNAUTHORIZED");
    },
  );

  await t.test(
    "deve retornar 401 para sessão inválida",
    async () => {
      repository.session = null;

      const response = await fetch(baseUrl, {
        headers: {
          Cookie: "sinapse_session=token-invalido",
        },
      });

      assert.equal(response.status, 401);
    },
  );

  await t.test(
    "deve permitir acesso com sessão válida",
    async () => {
      const now = new Date();

      repository.session = {
        id: "session-1",
        usuario_id: "user-1",
        token_hash: "hash",
        created_at: now,
        ultima_atividade_em: now,
        revogada_em: null,
        nome: "Usuário Teste",
        email: "usuario@example.com",
        role: "po",
        ativo: true,
      };

      const response = await fetch(baseUrl, {
        headers: {
          Cookie: "sinapse_session=token-valido",
        },
      });

      assert.equal(response.status, 200);

      const body = await response.json() as {
        user: {
          id: string;
          email: string;
          role: string;
        };
      };

      assert.equal(body.user.id, "user-1");
      assert.equal(
        body.user.email,
        "usuario@example.com",
      );
      assert.equal(body.user.role, "po");
    },
  );
});