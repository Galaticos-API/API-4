import { Router, type RequestHandler } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { SearchController } from "./search.controller.js";

export function createSearchRouter(controller = new SearchController(), authenticate: RequestHandler = requireAuth) {
  const router = Router();
  router.use(authenticate);
  router.get("/", controller.search);
  return router;
}

export const searchRouter = createSearchRouter();
