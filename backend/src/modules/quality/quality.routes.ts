import { Router } from "express";
import { qualityController } from "./quality.controller.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";

const router = Router();

router.use(requireAuth);

router.get("/pbis/:id/quality", qualityController.validatePbi);
router.get("/configuration/pbi", qualityController.getPbiConfiguration);
router.put("/configuration/pbi", requireRole("admin"), qualityController.updatePbiConfiguration);

export default router;
