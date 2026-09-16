import { Request, Response, NextFunction } from "express";
import { AppError } from "../modules/projects/projects.service.js";
import { ArchiveConflict } from "../modules/projects/archive.types.js";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ArchiveConflict) {
    res.status(409).json({ error: err.message, code: "ARCHIVE_CONFLICT" });
    return;
  }
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

  if (err instanceof SyntaxError && (err as { type?: string }).type === "entity.parse.failed") {
    res.status(400).json({
      error: "Corpo JSON inválido.",
      code: "VALIDATION_ERROR",
    });
    return;
  }

  // PostgreSQL errors may include row values and SQL; never log the raw error.
  const code = (err as { code?: unknown }).code;
  console.error("[Internal Server Error]", {
    code: typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : "INTERNAL_SERVER_ERROR",
  });
  res.status(500).json({
    error: "Erro interno do servidor.",
    code: "INTERNAL_SERVER_ERROR",
  });
}
