import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../../database/db.js";
import { requireAuth } from "../../middleware/requireAuth.js";

export const developersRouter = Router();

developersRouter.use(requireAuth);

// GET /api/v1/developers - Mapeamento de Desenvolvedores e Competências
developersRouter.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const devsRes = await pool.query(`
      SELECT d.id, d.senioridade, d.bio, u.nome, u.email, u.role
      FROM desenvolvedor d
      JOIN usuario u ON d.usuario_id = u.id
      ORDER BY u.nome ASC
    `);

    const techRes = await pool.query("SELECT id, nome, categoria FROM tecnologia ORDER BY nome ASC");

    const compsRes = await pool.query(`
      SELECT c.id, c.desenvolvedor_id, c.tecnologia_id, c.nivel, c.evidencia, t.nome as tecnologia_nome
      FROM competencia c
      JOIN tecnologia t ON c.tecnologia_id = t.id
    `);

    res.json({
      desenvolvedores: devsRes.rows,
      tecnologias: techRes.rows,
      competencias: compsRes.rows,
    });
  } catch (error) {
    next(error);
  }
});
