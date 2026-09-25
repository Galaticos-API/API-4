import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { BacklogSearchService, backlogSearchService } from "./backlog-search.service.js";

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function createBacklogSearchRouter(
  service: BacklogSearchService = backlogSearchService,
  authentication: RequestHandler = requireAuth,
): Router {
  const router = Router({ mergeParams: true });
  router.use(authentication);

  /**
   * @swagger
   * /api/v1/projects/{projectId}/backlog-search:
   *   get:
   *     summary: Busca textual relacional no backlog do projeto (S1-17)
   *     tags: [Backlog]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Itens do projeto com trecho, destaques e caminho hierárquico
   *       400:
   *         description: Consulta, status, tecnologia ou limite inválidos
   *       404:
   *         description: Projeto não encontrado
   */
  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await service.search({
        projetoId: String(req.params.projectId),
        q: text(req.query.q),
        status: text(req.query.status),
        tecnologiaId: text(req.query.tecnologia),
        limit: text(req.query.limit),
      }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const backlogSearchRouter = createBacklogSearchRouter();
