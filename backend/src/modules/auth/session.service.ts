import {
  createHash,
  randomBytes,
} from "node:crypto";

import { env } from "../../config/env.js";
import { authRepository } from "./auth.repository.js";
import {
  AuthenticatedUser,
  SessionRecord,
  SessionWithUser,
} from "./auth.types.js";

const SESSION_TOKEN_BYTES = 32;

interface SessionRepository {
  createSession(
    userId: string,
    tokenHash: string,
  ): Promise<SessionRecord>;

  findSessionByTokenHash(
    tokenHash: string,
  ): Promise<SessionWithUser | null>;

  touchSession(sessionId: string): Promise<void>;

  revokeSessionByTokenHash(tokenHash: string): Promise<void>;
}

export type SessionValidationResult =
  | {
      valid: true;
      user: AuthenticatedUser;
      sessionId: string;
    }
  | {
      valid: false;
      reason:
        | "not_found"
        | "revoked"
        | "inactive_user"
        | "idle_expired"
        | "absolute_expired";
    };

export class SessionService {
  constructor(
    private readonly repository: SessionRepository = authRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private hashToken(token: string): string {
    return createHash("sha256")
      .update(token)
      .digest("hex");
  }

  async createSession(
    userId: string,
  ): Promise<{ token: string; session: SessionRecord }> {
    const token = randomBytes(SESSION_TOKEN_BYTES).toString("hex");
    const tokenHash = this.hashToken(token);

    const session = await this.repository.createSession(
      userId,
      tokenHash,
    );

    return {
      token,
      session,
    };
  }

  async validateSession(
    token: string,
  ): Promise<SessionValidationResult> {
    const tokenHash = this.hashToken(token);

    const session =
      await this.repository.findSessionByTokenHash(tokenHash);

    if (!session) {
      return {
        valid: false,
        reason: "not_found",
      };
    }

    if (session.revogada_em) {
      return {
        valid: false,
        reason: "revoked",
      };
    }

    if (!session.ativo) {
      await this.repository.revokeSessionByTokenHash(tokenHash);

      return {
        valid: false,
        reason: "inactive_user",
      };
    }

    const now = this.now().getTime();
    const createdAt = new Date(session.created_at).getTime();
    const lastActivity = new Date(
      session.ultima_atividade_em,
    ).getTime();

    const idleLimit =
      env.AUTH_SESSION_IDLE_MINUTES * 60 * 1000;

    const absoluteLimit =
      env.AUTH_SESSION_MAX_HOURS * 60 * 60 * 1000;

    if (now - lastActivity > idleLimit) {
      await this.repository.revokeSessionByTokenHash(tokenHash);

      return {
        valid: false,
        reason: "idle_expired",
      };
    }

    if (now - createdAt > absoluteLimit) {
      await this.repository.revokeSessionByTokenHash(tokenHash);

      return {
        valid: false,
        reason: "absolute_expired",
      };
    }

    await this.repository.touchSession(session.id);

    return {
      valid: true,
      sessionId: session.id,
      user: {
        id: session.usuario_id,
        nome: session.nome,
        email: session.email,
        role: session.role,
      },
    };
  }

  async revokeSession(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);

    await this.repository.revokeSessionByTokenHash(tokenHash);
  }
}

export const sessionService = new SessionService();