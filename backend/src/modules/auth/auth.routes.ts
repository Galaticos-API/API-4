import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { authController } from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/login", authController.login);
authRouter.post("/logout", requireAuth, authController.logout);
authRouter.get("/me", requireAuth, authController.me);