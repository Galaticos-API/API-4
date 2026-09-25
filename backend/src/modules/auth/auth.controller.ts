import {
  NextFunction,
  Request,
  Response,
} from "express";

import { env } from "../../config/env.js";
import { SESSION_COOKIE_NAME } from "./auth.constants.js";
import {
  authService,
  AuthService,
} from "./auth.service.js";
import {
  sessionService,
  SessionService,
} from "./session.service.js";
import { loginSchema, registerSchema } from "./auth.types.js";
import { extractSessionToken } from "../../middleware/requireAuth.js";

export class AuthController {
  constructor(
    private readonly service: AuthService = authService,
    private readonly sessions: SessionService = sessionService,
  ) { }

  register = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parsed = registerSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "Dados de cadastro inválidos.",
          code: "VALIDATION_ERROR",
          details: parsed.error.flatten(),
        });
        return;
      }

      if (parsed.data.role === "admin") {
        const token = extractSessionToken(req);
        const session = token ? await this.sessions.validateSession(token) : null;
        if (!session?.valid || session.user.role !== "admin") {
          res.status(403).json({
            error: "Somente administradores podem criar contas de administrador.",
            code: "FORBIDDEN",
          });
          return;
        }
      }

      const result = await this.service.register(parsed.data);

      if (!result.success) {
        if (result.reason === "email_exists") {
          res.status(409).json({
            error: "E-mail já cadastrado na plataforma.",
            code: "EMAIL_EXISTS",
          });
          return;
        }
      } else {
        res.cookie(SESSION_COOKIE_NAME, result.token, {
          httpOnly: true,
          secure: env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge:
            env.AUTH_SESSION_MAX_HOURS * 60 * 60 * 1000,
        });

        res.status(201).json({
          user: result.user,
          token: result.token,
        });
      }


    } catch (error) {
      next(error);
    }
  };

  login = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parsed = loginSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "Dados de autenticação inválidos.",
          code: "VALIDATION_ERROR",
          details: parsed.error.flatten(),
        });
        return;
      }

      const result = await this.service.login(parsed.data);

      if (!result.success) {
        if (result.reason === "inactive_user") {
          res.status(403).json({
            error:
              "Usuário inativo. Entre em contato com o administrador.",
            code: "USER_INACTIVE",
          });
          return;
        }

        if (result.reason === "temporarily_locked") {
          res.status(429).json({
            error:
              "Muitas tentativas de autenticação. Tente novamente mais tarde.",
            code: "LOGIN_TEMPORARILY_LOCKED",
          });
          return;
        }

        res.status(401).json({
          error: "Credenciais inválidas.",
          code: "INVALID_CREDENTIALS",
        });
        return;
      }

      res.cookie(SESSION_COOKIE_NAME, result.token, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge:
          env.AUTH_SESSION_MAX_HOURS * 60 * 60 * 1000,
      });

      res.status(200).json({
        user: result.user,
        token: result.token,
      });
    } catch (error) {
      next(error);
    }
  };

  logout = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const token = req.sessionToken;

      if (token) {
        await this.sessions.revokeSession(token);
      }

      res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  me = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    res.status(200).json({
      user: req.auth,
    });
  };
}

export const authController = new AuthController();