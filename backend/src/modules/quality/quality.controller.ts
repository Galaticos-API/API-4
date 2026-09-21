import { Request, Response, NextFunction } from "express";
import { qualityService, QualityService } from "./quality.service.js";
import { qualityConfigurationRepository, QualityConfigurationRepository } from "./quality.configuration.repository.js";
import { z } from "zod";

const configurationSchema = z.object({
  checks: z.object({
    titulo_infinitivo: z.boolean(),
    historia_completa: z.boolean(),
    cenario_estruturado: z.boolean(),
    termos_vagos: z.boolean(),
    prototipo_vinculado: z.boolean(),
  }).strict(),
  vague_terms: z.array(z.string().trim().min(1).max(80)).max(100),
}).strict();

const evaluatePbiSchema = z.object({
  id: z.string().optional(),
  titulo: z.string().default(""),
  historia_como_um: z.string().default(""),
  historia_eu_quero: z.string().default(""),
  historia_para_que: z.string().default(""),
  requer_interface: z.boolean().default(false),
  prototipo_vinculado: z.boolean().default(false),
  cenarios: z.array(z.object({
    id: z.string().optional(),
    nome: z.string().nullable().optional(),
    dado: z.string().nullable().optional(),
    quando: z.string().nullable().optional(),
    entao: z.string().nullable().optional(),
  })).optional().default([]),
});

function getParamId(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

export class QualityController {
  constructor(
    private readonly service: QualityService = qualityService,
    private readonly configurationRepository: QualityConfigurationRepository = qualityConfigurationRepository,
  ) {}

  evaluate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = evaluatePbiSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Dados inválidos para avaliação.", code: "VALIDATION_ERROR", details: parsed.error.issues });
        return;
      }
      const result = await this.service.evaluatePbiInput(parsed.data);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  validatePbi = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParamId(req.params.id);
      const result = await this.service.validatePbi(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getPbiConfiguration = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.configurationRepository.getPbiConfiguration());
    } catch (error) {
      next(error);
    }
  };

  updatePbiConfiguration = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = configurationSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Configuração de qualidade inválida.", code: "VALIDATION_ERROR", details: parsed.error.issues });
        return;
      }
      const result = await this.configurationRepository.updatePbiConfiguration(parsed.data, req.auth!.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const qualityController = new QualityController();
