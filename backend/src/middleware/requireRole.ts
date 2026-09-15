import { NextFunction, Request, Response } from "express";
import { UserRole } from "../modules/auth/auth.types.js";

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Autenticação necessária.", code: "UNAUTHORIZED" });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: "Seu perfil não permite alterar projetos.", code: "FORBIDDEN" });
      return;
    }
    next();
  };
}
