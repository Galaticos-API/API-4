import type { NextFunction, Request, Response } from "express";
import { EpicosService } from "./epicos.service.js";

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

export class EpicosController {
  constructor(private readonly service: EpicosService) {}

  listByProject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectId = getParam(req.params.projectId);
      const result = await this.service.listByProject(projectId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectId = getParam(req.params.projectId);
      const userId = (req as any).user?.id ?? null;
      const result = await this.service.create({ ...req.body, projeto_id: projectId }, userId);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParam(req.params.id);
      const result = await this.service.getById(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParam(req.params.id);
      const userId = (req as any).user?.id ?? null;
      const result = await this.service.update(id, req.body, userId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  complete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParam(req.params.id);
      const userId = (req as any).user?.id ?? null;
      const result = await this.service.complete(id, userId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
