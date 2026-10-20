import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validateUuid } from "../../shared/errors.js";
import { IndexingRepository } from "./indexing.repository.js";

export function createIndexingRouter(repository = new IndexingRepository()) {
  const router = Router({ mergeParams: true });
  router.use(requireAuth);
  router.get("/", async (req, res, next) => {
    try {
      const projectId = String((req.params as Record<string, string>).projectId);
      validateUuid(projectId, "Projeto");
      res.json(await repository.list(projectId));
    } catch (error) { next(error); }
  });
  router.post("/:eventId/reprocess", requireRole("admin", "po"), async (req, res, next) => {
    try {
      const projectId = String(req.params.projectId);
      const eventId = String(req.params.eventId);
      validateUuid(projectId, "Projeto");
      validateUuid(eventId, "Evento");
      await repository.retry(projectId, eventId);
      res.status(202).json({ status: "pendente" });
    } catch (error) { next(error); }
  });
  return router;
}

export const indexingRouter = createIndexingRouter();
