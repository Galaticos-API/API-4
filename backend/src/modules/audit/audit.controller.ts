import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { auditService, AuditService } from "./audit.service.js";
import { ValidationError } from "../../shared/errors.js";

const querySchema = z.object({
  entidade_tipo: z.enum(["epico", "feature", "pbi"], {
    errorMap: () => ({ message: "O tipo da entidade deve ser épico, feature ou PBI." }),
  }),
  entidade_id: z.string().uuid("O identificador da entidade deve ser um UUID válido."),
});

export class AuditController {
  constructor(private readonly service: AuditService = auditService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new ValidationError(issue.message);
      }
      const items = await this.service.listByEntity(parsed.data.entidade_tipo, parsed.data.entidade_id);
      res.status(200).json({ items });
    } catch (error) {
      next(error);
    }
  };
}

export const auditController = new AuditController();
