import type { NextFunction, Request, Response } from "express";
import { AdminService } from "./admin.service.js";
import { ingestionObservabilityRepository, type IngestionObservabilityRepository } from "./ingestion-observability.js";

export class AdminController {
  constructor(
    private readonly service: AdminService = new AdminService(),
    private readonly ingestion: IngestionObservabilityRepository = ingestionObservabilityRepository,
  ) {}

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

  ingestionSnapshot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limitParam = typeof req.query.limit === "string" ? Number(req.query.limit) : 25;
      const limit = Number.isInteger(limitParam) && limitParam >= 1 && limitParam <= 100 ? limitParam : 25;
      res.json(await this.ingestion.snapshot(limit));
    } catch (error) {
      next(error);
    }
  };
}
