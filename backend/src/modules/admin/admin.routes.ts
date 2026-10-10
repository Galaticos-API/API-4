import { Router, type RequestHandler } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { AdminController } from "./admin.controller.js";

export function createAdminRouter(controller = new AdminController(), authenticate: RequestHandler = requireAuth) {
  const router = Router();
  router.use(authenticate);
  router.use(requireRole("admin"));
  router.get("/stats", controller.stats);
  router.post("/demo-seed", controller.loadDemo);
  // Compatibility alias: explicit project is required on both routes.
  router.post("/ingest-seed", controller.loadDemo);
  // Observabilidade do pipeline de ingestao (substitui o editor do n8n para
  // o admin acompanhar o worker). Query opcional: limit=1..100 (default 25).
  router.get("/ingestion", controller.ingestionSnapshot);
  return router;
}

export const adminRouter = createAdminRouter();
