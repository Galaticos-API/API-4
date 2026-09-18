import { Router } from "express";
import { EpicosController } from "./epicos.controller.js";
import { EpicosService } from "./epicos.service.js";
import { epicosRepository } from "./epicos.repository.js";
import { requireRole } from "../../middleware/requireRole.js";

export const epicosRouter = Router();
const controller = new EpicosController(new EpicosService(epicosRepository));
const canWrite = requireRole("admin", "po");

epicosRouter.get("/projects/:projectId/epicos", controller.listByProject);
epicosRouter.post("/projects/:projectId/epicos", canWrite, controller.create);
epicosRouter.get("/epicos/:id", controller.getById);
epicosRouter.patch("/epicos/:id", canWrite, controller.update);
epicosRouter.patch("/epicos/:id/complete", canWrite, controller.complete);
