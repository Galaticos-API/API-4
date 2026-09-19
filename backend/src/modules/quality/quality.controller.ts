import { Request, Response, NextFunction } from "express";
import { qualityService, QualityService } from "./quality.service.js";

function getParamId(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

export class QualityController {
  constructor(private readonly service: QualityService = qualityService) {}

  validatePbi = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParamId(req.params.id);
      const result = await this.service.validatePbi(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const qualityController = new QualityController();
