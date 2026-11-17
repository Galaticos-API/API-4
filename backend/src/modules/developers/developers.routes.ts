import { Router, type RequestHandler } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { DevelopersController } from "./developers.controller.js";

export function createDevelopersRouter(
  controller = new DevelopersController(),
  authenticate: RequestHandler = requireAuth,
) {
  const router = Router();
  router.use(authenticate);

  // Leitura aberta a qualquer membro autenticado da equipe (PBI-05.1.4)
  router.get("/", controller.list);
  router.get("/users", requireRole("admin", "po"), controller.listUsers);
  router.get("/:id", controller.getById);

  // Escrita restrita a gestores (PO e Admin — PBI-05.1.1)
  router.post("/", requireRole("admin", "po"), controller.create);
  router.patch("/:id", requireRole("admin", "po"), controller.update);

  return router;
}

export const developersRouter = createDevelopersRouter();
