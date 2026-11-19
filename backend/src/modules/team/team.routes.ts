import { Router, type NextFunction, type Request, type Response } from "express";
import { ValidationError } from "../../shared/errors.js";
import { TeamRepository } from "./team.repository.js";
import { TeamKnowledgeService } from "./team.service.js";
import { RecommendationsService } from "./recommendations.service.js";

// A autenticação é aplicada em app.ts (requireAuth) antes deste roteador.
export function createTeamRouter(
  repository: Pick<TeamRepository, "accessibleProjectIds" | "vocabulary" | "experienceWith"> = new TeamRepository(),
) {
  const router = Router();
  const service = new TeamKnowledgeService(repository);

  // PBI-05.2.1: quem já trabalhou com uma tecnologia, com a evidência de cada resultado.
  router.get("/experience", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const term = typeof req.query.tecnologia === "string" ? req.query.tecnologia.trim() : "";
      if (!term || term.length > 100) {
        throw new ValidationError("Informe a tecnologia a consultar (até 100 caracteres).");
      }
      const projectIds = await repository.accessibleProjectIds(req.auth!.id);
      res.json(await service.whoWorkedWith(term, projectIds));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const teamRouter = createTeamRouter();

// PBI-05.2.2: recomendação consultiva para uma feature. Montado em
// /api/v1/features/:entityId/recommendations, atrás do guard de acesso ao projeto da feature.
export function createFeatureRecommendationsRouter(
  service: Pick<RecommendationsService, "forFeature"> = new RecommendationsService(),
) {
  const router = Router({ mergeParams: true });
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await service.forFeature(String(req.params.entityId ?? ""), req.auth!.id));
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export const featureRecommendationsRouter = createFeatureRecommendationsRouter();
