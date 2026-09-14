import { Request, Response, NextFunction } from "express";
import { AppError } from "../modules/projects/projects.service.js";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
    return;
  }

  // Handle unique constraint violation from PostgreSQL directly (code 23505)
  if ((err as { code?: string }).code === "23505") {
    res.status(409).json({
      error: "Já existe um projeto ativo com este nome.",
      code: "UNIQUE_VIOLATION",
    });
    return;
  }

  console.error("[Internal Server Error]", err);
  res.status(500).json({
    error: "Erro interno do servidor.",
    code: "INTERNAL_SERVER_ERROR",
  });
}
