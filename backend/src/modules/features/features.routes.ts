import { Router } from "express";
import { featuresController } from "./features.controller.js";
import { requireRole } from "../../middleware/requireRole.js";

export const featuresRouter = Router();

const canWrite = requireRole("admin", "po");
featuresRouter.post("/", canWrite, featuresController.create);
featuresRouter.get("/", featuresController.list);
featuresRouter.get("/:id", featuresController.getById);
featuresRouter.put("/:id", canWrite, featuresController.update);
featuresRouter.patch("/:id", canWrite, featuresController.update);
featuresRouter.patch("/:id/complete", canWrite, featuresController.complete);
