import type { NextFunction, Request, Response } from "express";
import { ValidationError } from "../../shared/errors.js";
import { documentsService, type DocumentsService } from "./documents.service.js";

function paramOf(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export class DocumentsController {
  constructor(private readonly service: DocumentsService = documentsService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const limit = typeof req.query.limit === "string" ? req.query.limit : undefined;
      res.status(200).json(await this.service.list(paramOf(req.params.projectId), cursor, limit));
    } catch (error) {
      next(error);
    }
  };

  upload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) throw new ValidationError("Envie o arquivo no campo 'file' como multipart/form-data.");
      if (!Buffer.isBuffer(req.file.buffer)) throw new ValidationError("Arquivo inválido.");
      const created = await this.service.upload({
        projetoId: paramOf(req.params.projectId),
        usuarioId: req.auth?.id ?? "",
        fileName: req.file.originalname,
        content: req.file.buffer,
      });
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  };

  reprocess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.reprocess(paramOf(req.params.projectId), paramOf(req.params.documentId));
      res.status(202).json({ status: "pendente" });
    } catch (error) { next(error); }
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
