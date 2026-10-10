import { Router } from "express";
import type { Pool } from "pg";
import { pool } from "../../database/db.js";
import { TechnologiesRepository } from "./technologies.repository.js";
import { TechnologiesController } from "./technologies.controller.js";

export function createTechnologiesRouter(db: Pick<Pool, "query"> = pool) {
  const router = Router();
  const controller = new TechnologiesController(new TechnologiesRepository(db));
  router.get("/", controller.list);
  return router;
}

export const technologiesRouter = createTechnologiesRouter();
