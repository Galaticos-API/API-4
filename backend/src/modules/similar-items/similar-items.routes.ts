import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { ValidationError } from "../../shared/errors.js";
import { SimilarItemsService, similarItemsService } from "./similar-items.service.js";
import type { SimilarEntityType } from "./similar-items.types.js";

function requireUser(req: Request): string {
  if (!req.auth?.id) throw new ValidationError("Autenticação necessária.");
  return req.auth.id;
}

export function createProjectSimilarItemsRouter(
  service: SimilarItemsService = similarItemsService,
  authentication: RequestHandler = requireAuth,
): Router {
  const router = Router({ mergeParams: true });
  router.use(authentication);
  // POST only to carry the draft text; the operation is read-only and open to every authenticated profile.
  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await service.search(String(req.params.projectId), requireUser(req), req.body));
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export function createReuseSimilarItemRouter(
  tipo: SimilarEntityType,
  service: SimilarItemsService = similarItemsService,
  authentication: RequestHandler = requireAuth,
  canWrite: RequestHandler = requireRole("admin", "po"),
): Router {
  const router = Router({ mergeParams: true });
  router.use(authentication);
  router.post("/:origemId/reuse", canWrite, async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await service.reuse(tipo, String(req.params.entityId), String(req.params.origemId), requireUser(req), req.body));
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export const projectSimilarItemsRouter = createProjectSimilarItemsRouter();
export const epicSimilarItemsRouter = createReuseSimilarItemRouter("epico");
export const featureSimilarItemsRouter = createReuseSimilarItemRouter("feature");
export const pbiSimilarItemsRouter = createReuseSimilarItemRouter("pbi");
