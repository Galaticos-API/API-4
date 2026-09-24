import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../../database/db.js";
import { requireAuth } from "../../middleware/requireAuth.js";

export const documentsRouter = Router({ mergeParams: true });

documentsRouter.use(requireAuth);

// GET /api/v1/projects/:projectId/documents OR /api/v1/documents
documentsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.projectId || (req.query.projectId as string);
    let query = "SELECT d.id, d.projeto_id, d.nome, d.mime, d.caminho, d.status_processamento, d.created_at, d.updated_at, p.nome as projeto_nome FROM documento d JOIN projeto p ON d.projeto_id = p.id";
    const params: unknown[] = [];

    if (projectId) {
      query += " WHERE d.projeto_id = $1";
      params.push(projectId);
    }
    query += " ORDER BY d.created_at DESC";

    const result = await pool.query(query, params);
    res.json({ items: result.rows, total: result.rowCount });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/projects/:projectId/documents
documentsRouter.post("/", async (req: Request, res: Response, NextFunction) => {
  try {
    const projectId = req.params.projectId || req.body.projeto_id;
    const { nome, mime, caminho, status_processamento } = req.body;

    if (!projectId || !nome) {
      res.status(400).json({ error: "projeto_id e nome são obrigatórios" });
      return;
    }

    const insertResult = await pool.query(
      `INSERT INTO documento (projeto_id, nome, mime, caminho, status_processamento)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [projectId, nome, mime || "PDF", caminho || `/uploads/${nome}`, status_processamento || "processado"]
    );

    // Registra também um trecho em chunk para permitir busca vetorial no acervo
    await pool.query(
      `INSERT INTO chunk (projeto_id, entidade_tipo, entidade_id, texto, metadados_json)
       VALUES ($1, 'documento', $2, $3, $4)`,
      [
        projectId,
        insertResult.rows[0].id,
        `Documento indexado: ${nome}. Conteúdo técnico importado do acervo do projeto.`,
        JSON.stringify({ documento_id: insertResult.rows[0].id, nome }),
      ]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    NextFunction(error);
  }
});

// DELETE /api/v1/documents/:id
documentsRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM documento WHERE id = $1", [id]);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
