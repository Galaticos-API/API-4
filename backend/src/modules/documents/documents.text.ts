import { Router } from "express";
import { Pool } from "pg";
import { pool } from "../../database/db.js";
import { withTransaction } from "../../database/transaction.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";

export class DocumentTextRepository {
  constructor(private readonly db: Pool = pool) {}
  async read(projectId: string, documentId: string, chunkId: string, offset?: number) {
    return withTransaction(this.db, async client => {
      const document = (await client.query(
        `SELECT d.id,d.nome AS name,d.projeto_id AS project_id FROM documento d JOIN projeto p ON p.id=d.projeto_id
         WHERE d.id=$1 AND d.projeto_id=$2 AND p.status<>'arquivado' AND d.status_processamento='processado'`,
        [documentId, projectId],
      )).rows[0];
      if (!document) throw new NotFoundError("Documento indisponível.");
      const rows = (await client.query(
        `WITH ordered AS (
          SELECT id,texto AS text,
            (row_number() OVER (ORDER BY CASE WHEN jsonb_typeof(metadados_json->'chunk_index')='number'
              THEN (metadados_json->>'chunk_index')::numeric END NULLS LAST,created_at,id)-1)::int AS index,
            count(*) OVER ()::int AS total
          FROM chunk WHERE projeto_id=$1 AND entidade_tipo='documento' AND entidade_id=$2
        ), target AS (SELECT index FROM ordered WHERE id=$3)
        SELECT ordered.*,COALESCE($4::int,(target.index/20)*20) AS page_offset FROM ordered CROSS JOIN target
        WHERE ordered.index>=COALESCE($4::int,(target.index/20)*20)
          AND ordered.index<COALESCE($4::int,(target.index/20)*20)+20 ORDER BY ordered.index`,
        [projectId, documentId, chunkId, offset ?? null],
      )).rows;
      if (!rows.length) throw new NotFoundError("Trecho indisponível. Refaça a busca.");
      const total = rows[0].total as number;
      const pageOffset = rows[0].page_offset as number;
      return { document, items: rows.map(row => ({ id: row.id, text: row.text, index: row.index })),
        offset: pageOffset, total, next_offset: pageOffset + rows.length < total ? pageOffset + rows.length : null };
    }, "snapshot");
  }
}
export function createDocumentTextRouter(repository = new DocumentTextRepository()) {
  const router = Router({ mergeParams: true });
  router.get("/:documentId/excerpts", requireAuth, async (req, res, next) => {
    try {
      const projectId = String(req.params.projectId);
      const documentId = String(req.params.documentId);
      const chunkId = typeof req.query.chunk_id === "string" ? req.query.chunk_id : "";
      validateUuid(projectId, "Projeto"); validateUuid(documentId, "Documento"); validateUuid(chunkId, "Trecho");
      const rawOffset = req.query.offset;
      if (rawOffset !== undefined && (typeof rawOffset !== "string" || !/^\d{1,8}$/.test(rawOffset))) throw new ValidationError("Página inválida.");
      res.json(await repository.read(projectId, documentId, chunkId, rawOffset === undefined ? undefined : Number(rawOffset)));
    } catch (error) { next(error); }
  });
  return router;
}
export const documentTextRouter = createDocumentTextRouter();
