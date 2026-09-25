import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { ValidationError } from "../../shared/errors.js";
import { DecisionsService, decisionsService } from "./decisions.service.js";
import type { DecisionEntityType } from "./decisions.types.js";

export function createDecisionsRouter(
  tipo: DecisionEntityType,
  service: DecisionsService = decisionsService,
  authentication: RequestHandler = requireAuth,
  canWrite: RequestHandler = requireRole("admin", "po"),
): Router {
  const router = Router({ mergeParams: true });
  router.use(authentication);

  /**
   * @swagger
   * /api/v1/{nivel}/{id}/decisions:
   *   get:
   *     summary: Lista as decisões do item e herdadas dos ascendentes (S1-18)
   *     tags: [Decisions]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Decisões em ordem cronológica, com autor, data e origem
   *       404:
   *         description: Item não encontrado
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await service.list(tipo, String(req.params.entityId)));
    } catch (error) {
      next(error);
    }
  });

  /**
   * @swagger
   * /api/v1/{nivel}/{id}/decisions:
   *   post:
   *     summary: Registra uma decisão no item (S1-18)
   *     tags: [Decisions]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       201:
   *         description: Decisão registrada com autor e data
   *       400:
   *         description: Campos obrigatórios ausentes ou inválidos
   *       403:
   *         description: Perfil sem permissão de escrita
   *       404:
   *         description: Item não encontrado
   *       409:
   *         description: Item ou ancestral arquivado
   */
  router.post("/", canWrite, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.auth?.id) throw new ValidationError("Autenticação necessária.");
      res.status(201).json(await service.create(tipo, String(req.params.entityId), req.auth.id, req.body));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const projectDecisionsRouter = createDecisionsRouter("projeto");
export const epicDecisionsRouter = createDecisionsRouter("epico");
export const featureDecisionsRouter = createDecisionsRouter("feature");
export const pbiDecisionsRouter = createDecisionsRouter("pbi");
