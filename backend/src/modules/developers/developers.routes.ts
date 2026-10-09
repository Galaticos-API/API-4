import { Router, type RequestHandler } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { DevelopersController } from "./developers.controller.js";

export function createDevelopersRouter(controller = new DevelopersController(), authenticate: RequestHandler = requireAuth) {
  const router = Router();
  router.use(authenticate);
  router.get("/", controller.list);
  return router;
}

export const developersRouter = createDevelopersRouter();
