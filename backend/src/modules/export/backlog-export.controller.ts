import type { NextFunction, Request, RequestHandler, Response } from "express";
import { backlogExportService, type BacklogExportService } from "./backlog-export.service.js";
import type { MarkdownDocument } from "./backlog-export.types.js";

// O acesso ao projeto já é verificado por createProjectAccessRouter em /epics/:id e
// /features/:id (todas as subrotas); aqui só se gera e entrega o arquivo.
function sendMarkdown(res: Response, document: MarkdownDocument): void {
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${document.filename}"; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
  );
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(document.content);
}

function paramId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function createBacklogExportHandlers(service: BacklogExportService = backlogExportService): {
  epic: RequestHandler;
  feature: RequestHandler;
} {
  return {
    epic: async (req: Request, res: Response, next: NextFunction) => {
      try { sendMarkdown(res, await service.exportEpic(paramId(req))); } catch (error) { next(error); }
    },
    feature: async (req: Request, res: Response, next: NextFunction) => {
      try { sendMarkdown(res, await service.exportFeature(paramId(req))); } catch (error) { next(error); }
    },
  };
}

export const backlogExportHandlers = createBacklogExportHandlers();
