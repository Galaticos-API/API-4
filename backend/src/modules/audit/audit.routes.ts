import { Router } from "express";
import { auditController } from "./audit.controller.js";

export const auditRouter = Router();

/**
 * @swagger
 * /api/v1/audit:
 *   get:
 *     summary: Consultar histórico de auditoria de um item
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entidade_tipo
 *         required: true
 *         schema:
 *           type: string
 *           enum: [epico, feature, pbi]
 *       - in: query
 *         name: entidade_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Histórico ordenado da mais recente para a mais antiga
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       acao:
 *                         type: string
 *                       justificativa:
 *                         type: string
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       usuario_id:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                       usuario_nome:
 *                         type: string
 *                         nullable: true
 *       400:
 *         description: Filtros inválidos
 *       401:
 *         description: Não autenticado
 */
auditRouter.get("/", auditController.list);
