import {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  SessionService,
  sessionService,
} from "../modules/auth/session.service.js";

export function extractSessionToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) return authHeader.split(" ")[1];
  const match = req.headers.cookie?.match(/(?:^|;\s*)sinapse_session=([^;]+)/);
  return match?.[1];
}

export function createRequireAuth(
  service: SessionService = sessionService,
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const token = extractSessionToken(req);

      if (!token) {
        res.status(401).json({
          error: "Autenticação necessária.",
          code: "UNAUTHORIZED",
        });
        return;
      }

      const result = await service.validateSession(token);

      if (!result.valid) {
        res.status(401).json({
          error: "Sessão inválida ou expirada.",
          code: "UNAUTHORIZED",
        });
        return;
      }

      req.auth = result.user;
      req.sessionToken = token;

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireAuth = createRequireAuth();