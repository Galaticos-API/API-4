import { Router } from "express";
import { qualityController } from "./quality.controller.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);

router.get("/pbis/:id/quality", qualityController.validatePbi);

export default router;
