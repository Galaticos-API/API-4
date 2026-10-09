import type { NextFunction, Request, Response } from "express";
import { SearchService } from "./search.service.js";

export class SearchController {
  constructor(private readonly service: SearchService = new SearchService()) {}

  search = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.service.search(req.query, req.auth!.id));
    } catch (error) {
      next(error);
    }
  };
}
