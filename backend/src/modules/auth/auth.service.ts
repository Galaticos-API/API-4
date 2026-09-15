import { env } from "../../config/env.js";
import { authRepository } from "./auth.repository.js";
import {
  hashPassword,
  verifyPassword,
} from "./pssword.service.js";
import { sessionService } from "./session.service.js";
import {
  LoginDTO,
  SessionRecord,
  UserRecord,
} from "./auth.types.js";

interface AuthRepositoryPort {
  findUserByEmail(email: string): Promise<UserRecord | null>;

  recordFailedLogin(
    userId: string,
    maxAttempts: number,
    lockoutMinutes: number,
  ): Promise<UserRecord | null>;

  resetLoginAttempts(userId: string): Promise<void>;
}

interface SessionServicePort {
  createSession(
    userId: string,
  ): Promise<{
    token: string;
    session: SessionRecord;
  }>;
}

export type LoginResult =
  | {
      success: true;
      token: string;
      user: {
        id: string;
        nome: string;
        email: string;
        role: UserRecord["role"];
      };
    }
  | {
      success: false;
      reason:
        | "invalid_credentials"
        | "inactive_user"
        | "temporarily_locked";
      blockedUntil?: Date | string;
    };

let dummyHashPromise: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(
      "Sinapse-Dummy-Password-For-Timing-Protection",
    );
  }

  return dummyHashPromise;
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepositoryPort = authRepository,
    private readonly sessions: SessionServicePort = sessionService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async login(data: LoginDTO): Promise<LoginResult> {
    const email = data.email.trim().toLowerCase();

    const user = await this.repository.findUserByEmail(email);

    // Faz uma verificação real mesmo quando o usuário não existe.
    // Reduz diferença de tempo entre:
    // "e-mail inexistente" e "senha incorreta".
    if (!user) {
      const dummyHash = await getDummyHash();

      await verifyPassword(data.password, dummyHash);

      return {
        success: false,
        reason: "invalid_credentials",
      };
    }

    const now = this.now();

    if (user.bloqueado_ate) {
      const blockedUntil = new Date(user.bloqueado_ate);

      if (blockedUntil.getTime() > now.getTime()) {
        return {
          success: false,
          reason: "temporarily_locked",
          blockedUntil: user.bloqueado_ate,
        };
      }

      // O bloqueio anterior já terminou.
      // Inicia uma nova janela de tentativas.
      await this.repository.resetLoginAttempts(user.id);

      user.tentativas_login = 0;
      user.bloqueado_ate = null;
    }

    const passwordValid = await verifyPassword(
      data.password,
      user.senha_hash,
    );

    if (!passwordValid) {
      const updatedUser =
        await this.repository.recordFailedLogin(
          user.id,
          env.AUTH_MAX_LOGIN_ATTEMPTS,
          env.AUTH_LOCKOUT_MINUTES,
        );

      if (
        updatedUser?.bloqueado_ate &&
        new Date(updatedUser.bloqueado_ate).getTime() >
          now.getTime()
      ) {
        return {
          success: false,
          reason: "temporarily_locked",
          blockedUntil: updatedUser.bloqueado_ate,
        };
      }

      return {
        success: false,
        reason: "invalid_credentials",
      };
    }

    if (!user.ativo) {
      return {
        success: false,
        reason: "inactive_user",
      };
    }

    await this.repository.resetLoginAttempts(user.id);

    const { token } = await this.sessions.createSession(
      user.id,
    );

    return {
      success: true,
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
      },
    };
  }
}

export const authService = new AuthService();