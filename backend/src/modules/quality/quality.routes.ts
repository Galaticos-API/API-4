import { Router } from "express";
import { qualityController } from "./quality.controller.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";

const router = Router();

router.use(requireAuth);

/**
 * @swagger
 * /api/v1/quality/pbis/{id}/quality:
 *   get:
 *     summary: Validar qualidade de um PBI
 *     tags: [Quality]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do PBI
 *     responses:
 *       200:
 *         description: Relatório de qualidade do PBI
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entity_type:
 *                   type: string
 *                   enum: [pbi]
 *                 entity_id:
 *                   type: string
 *                   format: uuid
 *                 rule_version:
 *                   type: string
 *                 checks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       check_id:
 *                         type: string
 *                       check_name:
 *                         type: string
 *                       passed:
 *                         type: boolean
 *                       message:
 *                         type: string
 *                       applicable:
 *                         type: boolean
 *                 score_completude:
 *                   type: number
 *                   nullable: true
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: PBI não encontrado
 */
router.get("/pbis/:id/quality", qualityController.validatePbi);

/**
 * @swagger
 * /api/v1/quality/configuration/pbi:
 *   get:
 *     summary: Obter configuração de qualidade para PBIs
 *     tags: [Quality]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuração de qualidade
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rule_version:
 *                   type: string
 *                 checks:
 *                   type: object
 *                   properties:
 *                     titulo_infinitivo:
 *                       type: boolean
 *                     historia_completa:
 *                       type: boolean
 *                     cenario_estruturado:
 *                       type: boolean
 *                     termos_vagos:
 *                       type: boolean
 *                     prototipo_vinculado:
 *                       type: boolean
 *                 vague_terms:
 *                   type: array
 *                   items:
 *                     type: string
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
router.get("/configuration/pbi", qualityController.getPbiConfiguration);

/**
 * @swagger
 * /api/v1/quality/configuration/pbi:
 *   put:
 *     summary: Atualizar configuração de qualidade para PBIs
 *     tags: [Quality]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - checks
 *               - vague_terms
 *             properties:
 *               checks:
 *                 type: object
 *                 required:
 *                   - titulo_infinitivo
 *                   - historia_completa
 *                   - cenario_estruturado
 *                   - termos_vagos
 *                   - prototipo_vinculado
 *                 properties:
 *                   titulo_infinitivo:
 *                     type: boolean
 *                   historia_completa:
 *                     type: boolean
 *                   cenario_estruturado:
 *                     type: boolean
 *                   termos_vagos:
 *                     type: boolean
 *                   prototipo_vinculado:
 *                     type: boolean
 *               vague_terms:
 *                 type: array
 *                 items:
 *                   type: string
 *                   minLength: 1
 *                   maxLength: 80
 *                 maxItems: 100
 *                 description: Termos considerados vagos
 *     responses:
 *       200:
 *         description: Configuração atualizada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rule_version:
 *                   type: string
 *                 checks:
 *                   type: object
 *                   properties:
 *                     titulo_infinitivo:
 *                       type: boolean
 *                     historia_completa:
 *                       type: boolean
 *                     cenario_estruturado:
 *                       type: boolean
 *                     termos_vagos:
 *                       type: boolean
 *                     prototipo_vinculado:
 *                       type: boolean
 *                 vague_terms:
 *                   type: array
 *                   items:
 *                     type: string
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
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (apenas admin)
 */
router.put("/configuration/pbi", requireRole("admin"), qualityController.updatePbiConfiguration);

export default router;
