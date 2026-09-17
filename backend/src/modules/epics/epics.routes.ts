import { Router } from "express";
import { epicsController } from "./epics.controller.js";
import { requireRole } from "../../middleware/requireRole.js";

export const epicsRouter = Router();

const canWrite = requireRole("admin", "po");
epicsRouter.post("/", canWrite, epicsController.create);
epicsRouter.get("/", epicsController.list);
epicsRouter.get("/:id", epicsController.getById);
epicsRouter.put("/:id", canWrite, epicsController.update);
epicsRouter.patch("/:id", canWrite, epicsController.update);
epicsRouter.patch("/:id/complete", canWrite, epicsController.complete);
