import { Router, type RequestHandler } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { DevelopersController } from "./developers.controller.js";
import { CompetenciesController } from "./competencies.service.js";
import { AllocationsController } from "./allocations.service.js";

export function createDevelopersRouter(
  controller = new DevelopersController(),
  authenticate: RequestHandler = requireAuth,
  competencies = new CompetenciesController(),
  allocations = new AllocationsController(),
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

  // Competências sobre o vocabulário controlado (PBI-05.1.2)
  router.post("/:id/competencies", requireRole("admin", "po"), competencies.create);
  router.patch("/:id/competencies/:competencyId", requireRole("admin", "po"), competencies.update);
  router.delete("/:id/competencies/:competencyId", requireRole("admin", "po"), competencies.remove);

  // Alocações com papel e período (PBI-05.1.3). Alocação vigente concede ao usuário vinculado
  // acesso ao projeto, por isso a escrita fica com gestores e é auditada.
  router.post("/:id/allocations", requireRole("admin", "po"), allocations.create);
  router.patch("/:id/allocations/:allocationId", requireRole("admin", "po"), allocations.update);
  router.delete("/:id/allocations/:allocationId", requireRole("admin", "po"), allocations.remove);

  return router;
}

export const developersRouter = createDevelopersRouter();
