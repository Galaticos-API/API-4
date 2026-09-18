import { Router } from "express";
import { criteriaController } from "./criteria.controller.js";
import { requireRole } from "../../middleware/requireRole.js";

export const criteriaRouter = Router();

const canWrite = requireRole("admin", "po");
criteriaRouter.post("/", canWrite, criteriaController.create);
criteriaRouter.get("/", criteriaController.list);
criteriaRouter.delete("/:id", canWrite, criteriaController.delete);
