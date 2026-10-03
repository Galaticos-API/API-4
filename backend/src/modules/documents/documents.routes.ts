import express, { Router } from "express";
import multer from "multer";
import { env } from "../../config/env.js";
import { requireRole } from "../../middleware/requireRole.js";
import { DocumentsController, documentsController } from "./documents.controller.js";

const canWrite = requireRole("admin", "po");

export function createDocumentsRouter(
  controller: DocumentsController = documentsController,
  maxBytes: number = Math.floor(env.DOCUMENT_MAX_SIZE_MB * 1024 * 1024),
): Router {
  const router = Router({ mergeParams: true });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
  });

  // Handle multer errors
  router.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof Error && err.name === 'LimitExceedError') {
      res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', details: { max_bytes: maxBytes } });
      return;
    }
    next(err);
  });

  /**
   * @swagger
   * /api/v1/projects/{projectId}/documents:
   *   get:
   *     summary: Listar documentos do projeto
   *     tags: [Documents]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Documentos do projeto e limites de envio
   *       401:
   *         description: Não autenticado
   *       404:
   *         description: Projeto não encontrado
   */
  router.get("/", controller.list);

  /**
   * @swagger
   * /api/v1/projects/{projectId}/documents:
   *   post:
   *     summary: Enviar documento (PDF, DOCX, MD ou TXT) como multipart/form-data
   *     tags: [Documents]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - file
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *     responses:
   *       201:
   *         description: Documento armazenado
   *       400:
   *         description: Arquivo inválido ou projeto arquivado
   *       403:
   *         description: Sem permissão de escrita
   *       404:
   *         description: Projeto não encontrado
   *       413:
   *         description: Arquivo acima do limite configurado
   */
  router.post("/", canWrite, upload.single("file"), controller.upload);

  /**
   * @swagger
   * /api/v1/projects/{projectId}/documents/{documentId}:
   *   delete:
   *     summary: Remover documento de forma idempotente
   *     tags: [Documents]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       204:
   *         description: Documento removido ou já inexistente
   *       403:
   *         description: Sem permissão de escrita
   *       404:
   *         description: Projeto não encontrado
   */
  router.delete("/:documentId", canWrite, controller.remove);

  return router;
}

export const documentsRouter = createDocumentsRouter();
