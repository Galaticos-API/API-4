import { Router } from "express";
import type { Pool } from "pg";
import { pool } from "../../database/db.js";
import { requireRole } from "../../middleware/requireRole.js";
import { TechnologiesRepository } from "./technologies.repository.js";
import { TechnologiesController } from "./technologies.controller.js";
import { TechnologiesService } from "./technologies.service.js";

// A autenticação é aplicada em app.ts (requireAuth) antes deste roteador.
export function createTechnologiesRouter(db: Pick<Pool, "query"> = pool) {
  const router = Router();
  const controller = new TechnologiesController(new TechnologiesService(new TechnologiesRepository(db)));
  router.get("/", controller.list);
  // Gestores podem incluir uma tecnologia ao registrar competências (PBI-05.1.2, cenário 3);
  // alterar e remover itens do vocabulário é administração (PBI-06.2.2).
  router.post("/", requireRole("admin", "po"), controller.create);
  router.patch("/:id", requireRole("admin"), controller.update);
  router.delete("/:id", requireRole("admin"), controller.remove);
  return router;
}

export const technologiesRouter = createTechnologiesRouter();
