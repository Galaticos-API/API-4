import type { NextFunction, Request, Response } from "express";
import { AdminService } from "./admin.service.js";

export class AdminController {
  constructor(private readonly service: AdminService = new AdminService()) {}

  stats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.service.stats());
    } catch (error) {
      next(error);
    }
  };

  loadDemo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.service.loadDemo(req.body, req.auth!.id));
    } catch (error) {
      next(error);
    }
  };
}
