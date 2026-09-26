import { Router, Request, Response, NextFunction } from "express";
import { ValidationError, validateUuid } from "../../shared/errors.js";
import { pool } from "../../database/db.js";
import { requireAuth } from "../../middleware/requireAuth.js";

export const searchRouter = Router();

searchRouter.use(requireAuth);

// GET /api/v1/search?q=...&projeto_id=...
searchRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = ((req.query.q as string) || "").trim();
    const projectId = (req.query.projeto_id as string) || (req.query.projectId as string);

    if (projectId) validateUuid(projectId, "ID do projeto");
    if (q.length > 200) throw new ValidationError("A busca pode ter no máximo 200 caracteres.");

    if (!q) {
      // Se a query estiver vazia, retorna os chunks mais recentes
      let sql = `
        SELECT c.id, c.projeto_id, c.entidade_tipo, c.entidade_id, c.texto, c.metadados_json, c.created_at, p.nome as projeto_nome
        FROM chunk c
        JOIN projeto p ON c.projeto_id = p.id
      `;
      const params: unknown[] = [];
      if (projectId) {
        sql += " WHERE c.projeto_id = $1";
        params.push(projectId);
      }
      sql += " ORDER BY c.created_at DESC LIMIT 50";
      const result = await pool.query(sql, params);
      res.json({ items: result.rows, total: result.rowCount });
      return;
    }

    // Busca textual / ilike sobre a tabela chunk com escopo por projeto (RNF-03)
    let sql = `
      SELECT c.id, c.projeto_id, c.entidade_tipo, c.entidade_id, c.texto, c.metadados_json, c.created_at, p.nome as projeto_nome
      FROM chunk c
      JOIN projeto p ON c.projeto_id = p.id
      WHERE c.texto ILIKE $1
    `;
    const params: unknown[] = [`%${q.replace(/[\\%_]/g, "\\$&")}%`];

    if (projectId) {
      sql += " AND c.projeto_id = $2";
      params.push(projectId);
    }

    sql += " ORDER BY c.created_at DESC LIMIT 50";

    const result = await pool.query(sql, params);
    res.json({ items: result.rows, total: result.rowCount });
  } catch (error) {
    next(error);
  }
});
