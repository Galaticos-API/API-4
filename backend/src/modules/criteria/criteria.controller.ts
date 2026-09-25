import { Request, Response, NextFunction } from "express";
import { criteriaService, CriteriaService } from "./criteria.service.js";

function getParamId(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

export class CriteriaController {
  constructor(private readonly service: CriteriaService = criteriaService) {}

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
      res.status(200).json({ items: result });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParamId(req.params.id);
      const usuarioId = req.auth?.id ?? null;
      const result = await this.service.delete(
        id,
        usuarioId,
        req.body?.justificativa,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  move = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParamId(req.params.id);
      const usuarioId = req.auth?.id ?? null;
      const result = await this.service.move(id, req.body, usuarioId);
      res.status(200).json({ items: result });
    } catch (error) {
      next(error);
    }
  };
}

export const criteriaController = new CriteriaController();
