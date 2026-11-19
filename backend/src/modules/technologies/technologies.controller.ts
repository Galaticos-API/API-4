import type { NextFunction, Request, Response } from "express";
import { TechnologiesService } from "./technologies.service.js";

export class TechnologiesController {
  constructor(private readonly service: TechnologiesService = new TechnologiesService()) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ items: await this.service.list(req.query.q) });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(201).json(await this.service.create(req.body, req.auth!.id));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.service.update(String(req.params.id ?? ""), req.body, req.auth!.id));
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const removed = await this.service.remove(
        String(req.params.id ?? ""),
        req.query.confirmar_associacoes,
        req.auth!.id,
      );
      res.json({ removida: true, associacoes_removidas: removed });
    } catch (error) {
      next(error);
    }
  };
}
