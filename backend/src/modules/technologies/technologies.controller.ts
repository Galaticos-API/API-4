import type { NextFunction, Request, Response } from "express";
import { TechnologiesRepository } from "./technologies.repository.js";

export class TechnologiesController {
  constructor(private readonly repository: Pick<TechnologiesRepository, "list"> = new TechnologiesRepository()) {}

  list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ items: await this.repository.list() });
    } catch (error) {
      next(error);
    }
  };
}
