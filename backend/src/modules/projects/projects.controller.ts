import { Request, Response, NextFunction } from "express";
import { projectsService, ProjectsService } from "./projects.service.js";

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
      const justificativa = (req.body?.justificativa as string) || undefined;
      const result = await this.service.archive(id, usuarioId, justificativa);
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
