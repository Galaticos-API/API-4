import type { NextFunction, Request, Response } from "express";
import { ValidationError } from "../../shared/errors.js";
import { documentsService, type DocumentsService } from "./documents.service.js";

function paramOf(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function decodeFileName(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) throw new ValidationError("Informe o nome do arquivo no cabeçalho X-File-Name.");
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new ValidationError("Nome do arquivo inválido.");
  }
}

export class DocumentsController {
  constructor(private readonly service: DocumentsService = documentsService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.service.list(paramOf(req.params.projectId)));
    } catch (error) {
      next(error);
    }
  };

  upload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!Buffer.isBuffer(req.body)) throw new ValidationError("Envie o arquivo como corpo binário da requisição.");
      const created = await this.service.upload({
        projetoId: paramOf(req.params.projectId),
        usuarioId: req.auth?.id ?? "",
        fileName: decodeFileName(req.headers["x-file-name"]),
        content: req.body,
      });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.remove({
        projetoId: paramOf(req.params.projectId),
        documentoId: paramOf(req.params.documentId),
        usuarioId: req.auth?.id ?? "",
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const documentsController = new DocumentsController();
