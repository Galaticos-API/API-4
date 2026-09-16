import { Router } from "express";
import { projectsController } from "./projects.controller.js";
import { requireRole } from "../../middleware/requireRole.js";

export const projectsRouter = Router();

const canWrite = requireRole("admin", "po");
projectsRouter.post("/", canWrite, projectsController.create);
projectsRouter.get("/", projectsController.list);
projectsRouter.get("/:id", projectsController.getById);
projectsRouter.put("/:id", canWrite, projectsController.update);
projectsRouter.patch("/:id", canWrite, projectsController.update);
projectsRouter.patch("/:id/archive", canWrite, projectsController.archive);
