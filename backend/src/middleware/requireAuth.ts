import {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  SessionService,
  sessionService,
} from "../modules/auth/session.service.js";

export function createRequireAuth(
  service: SessionService = sessionService,
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      // Extrai o token do cabeçalho Authorization (Bearer <token>)
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({
          error: "Autenticação necessária.",
          code: "UNAUTHORIZED",
        });
        return;
      }

      const token = authHeader.split(" ")[1];

      if (!token) {
        res.status(401).json({
          error: "Token de autenticação ausente.",
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