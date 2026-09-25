import { Router, type NextFunction, type Request, type Response } from "express";
import type { Pool } from "pg";
import { pool } from "../../database/db.js";

export function createTechnologiesRouter(db: Pick<Pool, "query"> = pool) {
  const router = Router();

  router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await db.query<{ id: string; nome: string }>(
        "SELECT id, nome FROM tecnologia ORDER BY nome ASC, id ASC",
      );
      res.json({ items: result.rows });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const technologiesRouter = createTechnologiesRouter();
