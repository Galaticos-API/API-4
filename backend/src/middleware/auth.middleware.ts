import { Request, Response, NextFunction } from "express";
import { UnauthorizedError, ForbiddenError } from "../modules/projects/projects.service.js";

export interface AuthUser {
  id: string;
  role: string;
  email?: string;
  nome?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Normaliza strings de papéis para os valores canônicos do sistema: 'po', 'admin', 'dev'.
 */
export function normalizeRole(role?: string | null): string {
  if (!role) return "";
  const cleaned = role.trim().toLowerCase().replace(/[\s-_]+/g, "");
  if (cleaned === "po" || cleaned === "productowner") return "po";
  if (cleaned === "admin" || cleaned === "administrator" || cleaned === "administrador") return "admin";
  if (cleaned === "dev" || cleaned === "developer" || cleaned === "desenvolvedor") return "dev";
  return cleaned;
}

/**
 * Middleware que verifica se a requisição possui credenciais de autenticação (headers x-user-id / x-user-role ou authorization).
 * Injeta o objeto `req.user` na requisição.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const userIdHeader = req.headers["x-user-id"] as string | undefined;
  const roleHeader = (req.headers["x-user-role"] || req.headers["x-role"] || req.headers["x-user-perfil"]) as
    | string
    | undefined;

  let userId: string | null = null;
  let rawRole: string | null = null;

  if (userIdHeader && userIdHeader.trim().length > 0) {
    userId = userIdHeader.trim();
  }

  if (roleHeader && roleHeader.trim().length > 0) {
    rawRole = roleHeader.trim();
  }

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (!userId && token.length > 0) {
      userId = token;
    }
  }

  if (!userId && !rawRole) {
    throw new UnauthorizedError("Não autenticado. Identificador de usuário ou token ausente.");
  }

  const role = normalizeRole(rawRole) || "po";
  const finalUserId = userId || "00000000-0000-0000-0000-000000000000";

  req.user = {
    id: finalUserId,
    role,
  };

  next();
}

/**
 * Middleware factory que restringe o acesso a papéis específicos.
 * Exemplo: requireRole("po", "admin")
 */
export function requireRole(...allowedRoles: string[]) {
  const normalizedAllowed = allowedRoles.map((r) => normalizeRole(r));

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      try {
        requireAuth(req, res, () => {});
      } catch (err) {
        return next(err);
      }
    }

    const userRole = normalizeRole(req.user?.role);
    if (!userRole || !normalizedAllowed.includes(userRole)) {
      return next(
        new ForbiddenError(
          `Acesso negado. Esta operação exige papel [${allowedRoles.join(", ")}], mas o usuário possui papel [${req.user?.role || "desconhecido"}].`,
        ),
      );
    }

    next();
  };
}
