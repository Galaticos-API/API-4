import { Router, Request, Response, NextFunction } from "express";
import { auditService } from "./audit.service.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { validateUuid } from "../../shared/errors.js";

export const auditRouter = Router();

auditRouter.use(requireAuth);

function getStringParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

auditRouter.get("/:entidade_tipo/:entidade_id/history", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const entidadeTipo = getStringParam(req.params.entidade_tipo);
    const entidadeId = getStringParam(req.params.entidade_id);
    validateUuid(entidadeId, "ID da entidade");
    const history = await auditService.getHistory(entidadeTipo, entidadeId);
    res.status(200).json({ items: history });
  } catch (error) {
    next(error);
  }
});
