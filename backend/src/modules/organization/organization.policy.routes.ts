import { Router } from "express";
import { organizationPolicyController } from "./organization.policy.controller.js";
import { requireRole } from "../../middleware/requireRole.js";

export const organizationPolicyRouter = Router();

/**
 * @swagger
 * /api/v1/organization/policy:
 *   get:
 *     summary: Obter política de justificativa de alteração
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Política vigente da organização
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 justificativa_alteracao_obrigatoria:
 *                   type: boolean
 *                 updated_at:
 *                   type: string
 *                   format: date-time
 *                 updated_by:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     nome:
 *                       type: string
 *       401:
 *         description: Não autenticado
 */
organizationPolicyRouter.get("/policy", organizationPolicyController.get);

/**
 * @swagger
 * /api/v1/organization/policy:
 *   put:
 *     summary: Atualizar política de justificativa de alteração
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - justificativa_alteracao_obrigatoria
 *             properties:
 *               justificativa_alteracao_obrigatoria:
 *                 type: boolean
 *                 description: Quando verdadeiro, alterações de itens concluídos exigem justificativa
 *     responses:
 *       200:
 *         description: Política atualizada
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (apenas admin)
 */
organizationPolicyRouter.put("/policy", requireRole("admin"), organizationPolicyController.update);
