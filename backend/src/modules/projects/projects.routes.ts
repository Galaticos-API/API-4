import { Router } from "express";
import { projectsController } from "./projects.controller.js";

export const projectsRouter = Router();

projectsRouter.post("/", projectsController.create);
projectsRouter.get("/", projectsController.list);
projectsRouter.get("/:id", projectsController.getById);
projectsRouter.put("/:id", projectsController.update);
projectsRouter.patch("/:id", projectsController.update);
projectsRouter.patch("/:id/archive", projectsController.archive);
