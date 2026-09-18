import { Router } from "express";
import { EpicsController } from "./epics.controller.js";
import { EpicsService, epicsService } from "./epics.service.js";
import { requireRole } from "../../middleware/requireRole.js";

export function createEpicsRouter(service: EpicsService = epicsService) {
const epicsRouter = Router();
const epicsController = new EpicsController(service);

const canWrite = requireRole("admin", "po");
epicsRouter.post("/", canWrite, epicsController.create);
epicsRouter.get("/", epicsController.list);
epicsRouter.get("/:id", epicsController.getById);
epicsRouter.put("/:id", canWrite, epicsController.update);
epicsRouter.patch("/:id", canWrite, epicsController.update);
epicsRouter.patch("/:id/complete", canWrite, epicsController.complete);
return epicsRouter;
}

export const epicsRouter = createEpicsRouter();
