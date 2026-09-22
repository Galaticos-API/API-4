import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { organizationPolicyRepository, OrganizationPolicyRepository } from "./organization.policy.repository.js";
import { ValidationError } from "../../shared/errors.js";

const updateSchema = z.object({
  justificativa_alteracao_obrigatoria: z.boolean(),
}).strict();

export class OrganizationPolicyController {
  constructor(private readonly repository: OrganizationPolicyRepository = organizationPolicyRepository) {}

  get = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json(await this.repository.get());
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Informe se a justificativa de alteração é obrigatória.");
      }
      const result = await this.repository.update(parsed.data, req.auth!.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const organizationPolicyController = new OrganizationPolicyController();
