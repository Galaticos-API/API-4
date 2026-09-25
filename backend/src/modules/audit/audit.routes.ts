import { Router, Request, Response, NextFunction } from "express";
import { auditService } from "./audit.service.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { validateUuid, ValidationError } from "../../shared/errors.js";
import { z } from "zod";
import { ENTITY_TYPES } from "../quality/quality.types.js";
import { decodeAuditCursor } from "./audit.service.js";

export const auditRouter = Router();

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
}).strict();

auditRouter.use(requireAuth);

function getStringParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

auditRouter.get("/:entidade_tipo/:entidade_id/history", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const entidadeTipo = getStringParam(req.params.entidade_tipo);
    const entidadeId = getStringParam(req.params.entidade_id);
    if (!ENTITY_TYPES.includes(entidadeTipo as (typeof ENTITY_TYPES)[number])) {
      throw new ValidationError("Tipo de entidade inválido.");
    }
    validateUuid(entidadeId, "ID da entidade");
    const parsedQuery = historyQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      throw new ValidationError("Parâmetros de paginação inválidos.", parsedQuery.error.format());
    }
    const cursor = parsedQuery.data.cursor
      ? decodeAuditCursor(parsedQuery.data.cursor)
      : undefined;
    const history = await auditService.getHistory(
      entidadeTipo as (typeof ENTITY_TYPES)[number],
      entidadeId,
      parsedQuery.data.limit,
      cursor,
    );
    res.status(200).json(history);
  } catch (error) {
    next(error);
  }
});
