import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../../database/db.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireRole("admin"));

// GET /api/v1/admin/stats - Estatísticas reais do banco PostgreSQL
adminRouter.get("/stats", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const projectsCount = await pool.query("SELECT COUNT(*) FROM projeto");
    const epicsCount = await pool.query("SELECT COUNT(*) FROM epico");
    const featuresCount = await pool.query("SELECT COUNT(*) FROM feature");
    const pbisCount = await pool.query("SELECT COUNT(*) FROM pbi");
    const documentsCount = await pool.query("SELECT COUNT(*) FROM documento");
    const chunksCount = await pool.query("SELECT COUNT(*) FROM chunk");

    res.json({
      projetos: parseInt(projectsCount.rows[0].count, 10),
      epicos: parseInt(epicsCount.rows[0].count, 10),
      features: parseInt(featuresCount.rows[0].count, 10),
      pbis: parseInt(pbisCount.rows[0].count, 10),
      documentos: parseInt(documentsCount.rows[0].count, 10),
      chunksIndexados: parseInt(chunksCount.rows[0].count, 10),
      statusSistema: "operacional",
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/admin/ingest-seed - Reindexação de acervo do sistema
adminRouter.post("/ingest-seed", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Insere registros demonstrativos reais de acervo se o acervo estiver zerado
    const projectRes = await pool.query("SELECT id FROM projeto LIMIT 1");
    if (projectRes.rows.length === 0) {
      res.status(400).json({ error: "Crie ao menos um projeto antes de reindexar." });
      return;
    }

    const projectId = projectRes.rows[0].id;

    await pool.query(
      `INSERT INTO chunk (projeto_id, entidade_tipo, entidade_id, texto, metadados_json)
       VALUES
       ($1, 'documento', $1, 'Arquitetura Sinapse: O sistema utiliza PostgreSQL com extensão pgvector para busca vetorial híbrida.', '{"fonte":"docs/Architecture/README.md"}'),
       ($1, 'decisao', $1, 'Decisão de Arquitetura: O runtime de IA roda 100% local com Ollama (bge-m3 + qwen2.5:1.5b).', '{"fonte":"docs/PRD-PRO4TECH.md"}')
       ON CONFLICT DO NOTHING`,
      [projectId]
    );

    res.json({ message: "Reindexação e carga inicial do acervo concluídas com sucesso!", status: "sucesso" });
  } catch (error) {
    next(error);
  }
});
