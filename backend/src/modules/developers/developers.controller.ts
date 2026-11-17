import type { NextFunction, Request, Response } from "express";
import { DevelopersService } from "./developers.service.js";

export class DevelopersController {
  constructor(private readonly service: DevelopersService = new DevelopersService()) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.service.overview(req.auth?.id));
    } catch (error) {
      next(error);
    }
  };

  listUsers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.service.listLinkableUsers());
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = typeof req.params.id === "string" ? req.params.id : "";
      res.json(await this.service.getProfile(id, req.auth!.id));
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const created = await this.service.createProfile(req.body, req.auth!.id);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = typeof req.params.id === "string" ? req.params.id : "";
      const updated = await this.service.updateProfile(id, req.body, req.auth!.id);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  };
}
