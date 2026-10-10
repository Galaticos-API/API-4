import { Router, type NextFunction, type Request, type Response } from "express";
import { env } from "../../config/env.js";
import { ValidationError } from "../../shared/errors.js";
import { chunksService, type ChunksService } from "./chunks.service.js";

function paramOf(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Middleware server-to-server para o pipeline n8n. Confere o token compartilhado
 * em Authorization: Bearer <N8N_INGEST_TOKEN>; mantido separado do fluxo de
 * usuário humano (requireAuth) porque o n8n não tem sessão.
 */
export function requireIngestToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ", 2);
  if (scheme !== "Bearer" || !token || token !== env.N8N_INGEST_TOKEN) {
    res.status(401).json({ error: "Token de ingestão ausente ou inválido.", code: "INGEST_TOKEN_INVALID" });
    return;
  }
  next();
}

export function createChunksRouter(service: ChunksService = chunksService): Router {
  const router = Router({ mergeParams: true });

  /**
   * @swagger
   * /api/v1/projects/{projectId}/documents/{documentId}/chunks:
   *   post:
   *     summary: Persiste chunks com embeddings (pipeline n8n -> backend)
   *     description: >
   *       Chamado pelo workflow do n8n após extrair texto, chunking e embeddings.
   *       Substitui qualquer chunk anterior do mesmo documento (reindexação
   *       idempotente) e marca o documento como 'processado'. Autenticação por
   *       token compartilhado em Authorization: Bearer <N8N_INGEST_TOKEN>.
   *     tags: [Documents]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Chunks persistidos
   *       400:
   *         description: Payload inválido (chunks ausentes, embedding fora do padrão bge-m3)
   *       401:
   *         description: Token de ingestão ausente ou inválido
   *       404:
   *         description: Projeto ou documento não encontrados
   *       409:
   *         description: Projeto arquivado
   */
  router.post("/", requireIngestToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.body || typeof req.body !== "object") {
        throw new ValidationError("Corpo da requisição deve ser JSON com { chunks: [...] }.");
      }
      const result = await service.persist({
        projetoId: paramOf(req.params.projectId),
        documentoId: paramOf(req.params.documentId),
        chunks: (req.body as { chunks?: unknown }).chunks as never,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const chunksRouter = createChunksRouter();
