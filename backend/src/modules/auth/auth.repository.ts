import { Pool } from "pg";

import { pool } from "../../database/db.js";
import {
  SessionRecord,
  SessionWithUser,
  UserRecord,
  UserRole,
} from "./auth.types.js";

export class AuthRepository {
  private pool: Pool;

  constructor(customPool?: Pool) {
    this.pool = customPool ?? pool;
  }

  async createUser(data: {
    nome: string;
    email: string;
    senha_hash: string;
    role?: UserRole;
  }): Promise<UserRecord> {
    const result = await this.pool.query<UserRecord>(
      `
        INSERT INTO usuario (
          nome,
          email,
          senha_hash,
          role
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
          id,
          nome,
          email,
          senha_hash,
          role,
          ativo,
          tentativas_login,
          bloqueado_ate,
          created_at,
          updated_at
      `,
      [data.nome.trim(), data.email.trim().toLowerCase(), data.senha_hash, data.role ?? "po"],
    );

    return result.rows[0];
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRecord>(
      `
        SELECT
          id,
          nome,
          email,
          senha_hash,
          role,
          ativo,
          tentativas_login,
          bloqueado_ate,
          created_at,
          updated_at
        FROM usuario
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email.trim()],
    );

    return result.rows[0] ?? null;
  }

  async recordFailedLogin(
    userId: string,
    maxAttempts: number,
    lockoutMinutes: number,
  ): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRecord>(
      `
        UPDATE usuario
        SET
          tentativas_login = tentativas_login + 1,
          bloqueado_ate = CASE
            WHEN tentativas_login + 1 >= $2
              THEN CURRENT_TIMESTAMP + ($3 * INTERVAL '1 minute')
            ELSE bloqueado_ate
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
          id,
          nome,
          email,
          senha_hash,
          role,
          ativo,
          tentativas_login,
          bloqueado_ate,
          created_at,
          updated_at
      `,
      [userId, maxAttempts, lockoutMinutes],
    );

    return result.rows[0] ?? null;
  }

  async resetLoginAttempts(userId: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE usuario
        SET
          tentativas_login = 0,
          bloqueado_ate = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [userId],
    );
  }

  async createSession(
    userId: string,
    tokenHash: string,
  ): Promise<SessionRecord> {
    const result = await this.pool.query<SessionRecord>(
      `
        INSERT INTO sessao (
          usuario_id,
          token_hash
        )
        VALUES ($1, $2)
        RETURNING
          id,
          usuario_id,
          token_hash,
          created_at,
          ultima_atividade_em,
          revogada_em
      `,
      [userId, tokenHash],
    );

    return result.rows[0];
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<SessionWithUser | null> {
    const result = await this.pool.query<SessionWithUser>(
      `
        SELECT
          s.id,
          s.usuario_id,
          s.token_hash,
          s.created_at,
          s.ultima_atividade_em,
          s.revogada_em,
          u.nome,
          u.email,
          u.role,
          u.ativo
        FROM sessao s
        INNER JOIN usuario u
          ON u.id = s.usuario_id
        WHERE s.token_hash = $1
        LIMIT 1
      `,
      [tokenHash],
    );

    return result.rows[0] ?? null;
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE sessao
        SET ultima_atividade_em = CURRENT_TIMESTAMP
        WHERE id = $1
          AND revogada_em IS NULL
      `,
      [sessionId],
    );
  }

  async revokeSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE sessao
        SET revogada_em = CURRENT_TIMESTAMP
        WHERE token_hash = $1
          AND revogada_em IS NULL
      `,
      [tokenHash],
    );
  }
}

export const authRepository = new AuthRepository();