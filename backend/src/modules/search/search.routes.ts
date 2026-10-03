import { Router, Request, Response, NextFunction, type RequestHandler } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { ValidationError, validateUuid } from "../../shared/errors.js";
import { parseSearchLevel, SearchService } from "./search.service.js";

const textQuery = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ValidationError(`${field} deve ser texto.`);
  return value;
};

export function createSearchRouter(service: SearchService = new SearchService(), auth: RequestHandler = requireAuth) {
  const router = Router();
  router.use(auth);

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = textQuery(req.query.q, "A busca");
      const projectId = textQuery(req.query.projeto_id ?? req.query.projectId, "ID do projeto");
      const technologyId = textQuery(req.query.tecnologia_id ?? req.query.technology_id, "ID da tecnologia");
      const levelValue = textQuery(req.query.nivel ?? req.query.level, "Nível");
      const limitValue = textQuery(req.query.limit, "Limite");

      if (!query?.trim()) throw new ValidationError("Informe o texto da busca.");
      if (query.trim().length < 3 || query.trim().length > 200) throw new ValidationError("A busca deve ter entre 3 e 200 caracteres.");
      if (!projectId) throw new ValidationError("Informe o projeto para manter o escopo da busca.");
      validateUuid(projectId, "ID do projeto");
      if (technologyId) validateUuid(technologyId, "ID da tecnologia");
      const parsedLimit = limitValue === undefined ? 10 : (/^(?:[1-9]|[1-4]\d|50)$/.test(limitValue) ? Number(limitValue) : Number.NaN);
      if (!Number.isInteger(parsedLimit)) throw new ValidationError("O limite deve ser um inteiro entre 1 e 50.");

      const result = await service.search({
        query,
        projectId,
        technologyId,
        level: parseSearchLevel(levelValue),
        limit: parsedLimit,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const searchRouter = createSearchRouter();
