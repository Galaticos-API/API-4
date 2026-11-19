import type { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { withTransaction } from "../../database/transaction.js";
import { AppError, NotFoundError } from "../../shared/errors.js";
import { auditService } from "../audit/audit.service.js";
import type { UserRole } from "../auth/auth.types.js";

/** Ação gravada na auditoria para cada troca de papel (S3-13 / PBI-06.2.1). */
export const ROLE_CHANGE_AUDIT_ACTION = "ALTERAR_PAPEL";

/**
 * Chave do lock transacional que serializa as trocas de papel. Duas
 * requisições simultâneas que rebaixam administradores diferentes não podem
 * ler a mesma contagem e terminar sem nenhum administrador ativo.
 */
export const ROLE_CHANGE_LOCK_KEY = "sinapse:usuario:papel";

export const LAST_ADMIN_MESSAGE =
  "Não é possível alterar o perfil do único administrador ativo. Defina outro administrador antes de alterar este perfil.";

export interface PlatformUserRole {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  ativo: boolean;
  created_at: string;
  papel_alterado_em: string | null;
  papel_alterado_por: string | null;
  papel_alterado_por_nome: string | null;
}

export interface RoleChangeResult {
  usuario: PlatformUserRole;
  papel_anterior: UserRole;
  alterado: boolean;
}

export class LastAdminError extends AppError {
  constructor() {
    super(LAST_ADMIN_MESSAGE, 409, "LAST_ADMIN");
    this.name = "LastAdminError";
  }
}

type Queryable = Pick<Pool, "query" | "connect">;

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return new Date(value as string | Date).toISOString();
}

function normalize(row: Record<string, any>): PlatformUserRole {
  return {
    id: String(row.id),
    nome: String(row.nome),
    email: String(row.email),
    role: row.role as UserRole,
    ativo: row.ativo !== false,
    created_at: toIso(row.created_at) ?? new Date(0).toISOString(),
    papel_alterado_em: toIso(row.papel_alterado_em),
    papel_alterado_por: row.papel_alterado_por ?? null,
    papel_alterado_por_nome: row.papel_alterado_por_nome ?? null,
  };
}

// A última troca de papel vem da auditoria, que é a fonte de autor e data.
const USER_SELECT = `
  SELECT u.id, u.nome, u.email, u.role, u.ativo, u.created_at,
         ult.created_at AS papel_alterado_em,
         ult.usuario_id AS papel_alterado_por,
         autor.nome AS papel_alterado_por_nome
    FROM usuario u
    LEFT JOIN LATERAL (
      SELECT a.created_at, a.usuario_id
        FROM auditoria a
       WHERE a.entidade_tipo = 'usuario'
         AND a.entidade_id = u.id
         AND a.acao = '${ROLE_CHANGE_AUDIT_ACTION}'
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 1
    ) ult ON true
    LEFT JOIN usuario autor ON autor.id = ult.usuario_id`;

export class UserRolesRepository {
  constructor(private readonly db: Queryable = pool) {}

  async listUsers(): Promise<PlatformUserRole[]> {
    const { rows } = await this.db.query(`${USER_SELECT} ORDER BY lower(u.nome) ASC, u.id ASC`);
    return rows.map(normalize);
  }

  async changeRole(
    targetUserId: string,
    role: UserRole,
    actorId: string,
    justificativa?: string | null,
  ): Promise<RoleChangeResult> {
    return withTransaction(this.db as Pool, async (client: PoolClient) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [ROLE_CHANGE_LOCK_KEY]);

      const current = await client.query<{ id: string; role: UserRole; ativo: boolean }>(
        "SELECT id, role, ativo FROM usuario WHERE id = $1 FOR UPDATE",
        [targetUserId],
      );
      const target = current.rows[0];
      if (!target) throw new NotFoundError("Usuário não encontrado.");

      const previous = target.role;
      if (previous !== role) {
        if (previous === "admin" && target.ativo !== false) {
          const others = await client.query<{ total: number }>(
            "SELECT COUNT(*)::int AS total FROM usuario WHERE role = 'admin' AND ativo = true AND id <> $1",
            [targetUserId],
          );
          if ((others.rows[0]?.total ?? 0) < 1) throw new LastAdminError();
        }

        await client.query(
          "UPDATE usuario SET role = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [targetUserId, role],
        );
        await auditService.record({
          usuario_id: actorId,
          entidade_tipo: "usuario",
          entidade_id: targetUserId,
          acao: ROLE_CHANGE_AUDIT_ACTION,
          justificativa: justificativa ?? null,
          dados_json: { papel_anterior: previous, papel_novo: role },
        }, client);
      }

      const updated = await client.query(`${USER_SELECT} WHERE u.id = $1`, [targetUserId]);
      return { usuario: normalize(updated.rows[0]), papel_anterior: previous, alterado: previous !== role };
    });
  }
}

export const userRolesRepository = new UserRolesRepository();
