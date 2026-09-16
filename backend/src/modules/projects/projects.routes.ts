import { Router } from "express";
import { projectsController } from "./projects.controller.js";
import { requireAuth, requireRole } from "../../middleware/auth.middleware.js";

export const projectsRouter = Router();

// Exige autenticação prévia em todos os endpoints de projetos (PBI-06.1.3)
projectsRouter.use(requireAuth);

// Escrita (Criação, Alteração, Arquivamento): restritas a Product Owner e Administrador (PBI-01.1.1 / EP-06)
projectsRouter.post("/", requireRole("po", "admin"), projectsController.create);
projectsRouter.put("/:id", requireRole("po", "admin"), projectsController.update);
projectsRouter.patch("/:id", requireRole("po", "admin"), projectsController.update);
projectsRouter.patch("/:id/archive", requireRole("po", "admin"), projectsController.archive);

// Leitura (Listagem, Detalhes): disponível para todos os papéis autenticados (dev, po, admin)
projectsRouter.get("/", projectsController.list);
projectsRouter.get("/:id", projectsController.getById);

