import { archiveHandlers } from "../projects/hierarchy-archive.js";
import { Router } from "express";
import { pbisController } from "./pbis.controller.js";
import { requireRole } from "../../middleware/requireRole.js";

export const pbisRouter = Router();

const canWrite = requireRole("admin", "po");
pbisRouter.post("/", canWrite, pbisController.create);
pbisRouter.get("/", pbisController.list);
pbisRouter.get("/:id", pbisController.getById);
pbisRouter.put("/:id", canWrite, pbisController.update);
pbisRouter.patch("/:id", canWrite, pbisController.update);
pbisRouter.patch("/:id/complete", canWrite, pbisController.complete);
pbisRouter.get("/:id/quality", pbisController.quality);

const archive = archiveHandlers("pbi");
pbisRouter.get("/:id/archive-impact", archive.impact);
pbisRouter.patch("/:id/archive", canWrite, archive.archive);
