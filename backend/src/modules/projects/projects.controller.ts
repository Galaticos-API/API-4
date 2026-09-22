import { Request, Response, NextFunction } from "express";
import { projectsService, ProjectsService } from "./projects.service.js";
import { ValidationError } from "../../shared/errors.js";
import { z } from "zod";

const confirmation = z.object({
  confirmado: z.literal(true),
  impacto: z.object({ projeto: z.number().int().min(0).max(1), epicos: z.number().int().nonnegative(), features: z.number().int().nonnegative(), pbis: z.number().int().nonnegative() }).strict(),
  justificativa: z.string().trim().max(2000).optional(),
});

function getParamId(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

export class ProjectsController {
  constructor(private readonly service: ProjectsService = projectsService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const usuarioId = req.auth?.id ?? null;
      const result = await this.service.create(req.body, usuarioId);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.list(req.query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParamId(req.params.id);
      const result = await this.service.getById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParamId(req.params.id);
      const usuarioId = req.auth?.id ?? null;
      const result = await this.service.update(id, req.body, usuarioId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  archive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParamId(req.params.id);
      const usuarioId = req.auth?.id ?? null;
      const parsed = confirmation.safeParse(req.body);
      if (!parsed.success) throw new ValidationError("Consulte a prévia e confirme explicitamente o arquivamento.");
      const result = await this.service.archive(id, usuarioId, parsed.data.justificativa, parsed.data.impacto);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  archiveImpact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.service.archiveImpact(getParamId(req.params.id)));
    } catch (error) { next(error); }
  };
}

export const projectsController = new ProjectsController();
