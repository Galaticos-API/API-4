import type { NextFunction, Request, Response } from "express";
import { DevelopersService } from "./developers.service.js";

export class DevelopersController {
  constructor(private readonly service: DevelopersService = new DevelopersService()) {}

  list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.service.overview());
    } catch (error) {
      next(error);
    }
  };
}
