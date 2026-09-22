import { Router } from "express";
import { pbisController } from "./pbis.controller.js";
import { requireRole } from "../../middleware/requireRole.js";

export const pbisRouter = Router();

const canWrite = requireRole("admin", "po");

/**
 * @swagger
 * /api/v1/pbis:
 *   post:
 *     summary: Criar novo PBI (Product Backlog Item)
 *     tags: [PBIs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - feature_id
 *               - titulo
 *               - historia_como_um
 *               - historia_eu_quero
 *               - historia_para_que
 *             properties:
 *               feature_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID da feature
 *               titulo:
 *                 type: string
 *                 maxLength: 255
 *                 description: Título do PBI
 *               historia_como_um:
 *                 type: string
 *                 description: Bloco COMO UM da história de usuário
 *               historia_eu_quero:
 *                 type: string
 *                 description: Bloco EU QUERO da história de usuário
 *               historia_para_que:
 *                 type: string
 *                 description: Bloco PARA QUE da história de usuário
 *               regras_observacoes:
 *                 type: string
 *                 nullable: true
 *                 description: Regras e observações
 *               tipo:
 *                 type: string
 *                 maxLength: 50
 *                 default: Funcional
 *                 description: Tipo do PBI
 *               prioridade:
 *                 type: string
 *                 enum: [Must, Should, Could]
 *                 default: Must
 *                 description: Prioridade do PBI
 *               requer_interface:
 *                 type: boolean
 *                 default: false
 *                 description: Se requer interface
 *     responses:
 *       201:
 *         description: PBI criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Pbi'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 */
pbisRouter.post("/", canWrite, pbisController.create);

/**
 * @swagger
 * /api/v1/pbis:
 *   get:
 *     summary: Listar PBIs
 *     tags: [PBIs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: feature_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filtrar por feature
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [rascunho, concluido]
 *         description: Filtrar por status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 100
 *         description: Limite de resultados
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Offset para paginação
 *     responses:
 *       200:
 *         description: Lista de PBIs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Pbi'
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       401:
 *         description: Não autenticado
 */
pbisRouter.get("/", pbisController.list);

/**
 * @swagger
 * /api/v1/pbis/{id}:
 *   get:
 *     summary: Obter PBI por ID
 *     tags: [PBIs]
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
 *         description: PBI encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Pbi'
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: PBI não encontrado
 */
pbisRouter.get("/:id", pbisController.getById);

/**
 * @swagger
 * /api/v1/pbis/{id}:
 *   put:
 *     summary: Atualizar PBI
 *     tags: [PBIs]
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               titulo:
 *                 type: string
 *                 maxLength: 255
 *               historia_como_um:
 *                 type: string
 *               historia_eu_quero:
 *                 type: string
 *               historia_para_que:
 *                 type: string
 *               regras_observacoes:
 *                 type: string
 *                 nullable: true
 *               tipo:
 *                 type: string
 *                 maxLength: 50
 *               prioridade:
 *                 type: string
 *                 enum: [Must, Should, Could]
 *               requer_interface:
 *                 type: boolean
 *               justificativa:
 *                 type: string
 *                 nullable: true
 *                 description: Justificativa da alteração. Obrigatória para itens concluídos quando a organização exigir.
 *     responses:
 *       200:
 *         description: PBI atualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Pbi'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: PBI não encontrado
 */
pbisRouter.put("/:id", canWrite, pbisController.update);

/**
 * @swagger
 * /api/v1/pbis/{id}:
 *   patch:
 *     summary: Atualizar PBI parcialmente
 *     tags: [PBIs]
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               titulo:
 *                 type: string
 *                 maxLength: 255
 *               historia_como_um:
 *                 type: string
 *               historia_eu_quero:
 *                 type: string
 *               historia_para_que:
 *                 type: string
 *               regras_observacoes:
 *                 type: string
 *                 nullable: true
 *               tipo:
 *                 type: string
 *                 maxLength: 50
 *               prioridade:
 *                 type: string
 *                 enum: [Must, Should, Could]
 *               requer_interface:
 *                 type: boolean
 *               justificativa:
 *                 type: string
 *                 nullable: true
 *                 description: Justificativa da alteração. Obrigatória para itens concluídos quando a organização exigir.
 *     responses:
 *       200:
 *         description: PBI atualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Pbi'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: PBI não encontrado
 */
pbisRouter.patch("/:id", canWrite, pbisController.update);

/**
 * @swagger
 * /api/v1/pbis/{id}/complete:
 *   patch:
 *     summary: Marcar PBI como concluído
 *     tags: [PBIs]
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
 *         description: PBI marcado como concluído
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Pbi'
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: PBI não encontrado
 */
pbisRouter.patch("/:id/complete", canWrite, pbisController.complete);

/**
 * @swagger
 * /api/v1/pbis/{id}/quality:
 *   get:
 *     summary: Obter análise de qualidade do PBI
 *     tags: [PBIs]
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
 *         description: Análise de qualidade do PBI
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 score_completude:
 *                   type: number
 *                   nullable: true
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
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: PBI não encontrado
 */
pbisRouter.get("/:id/quality", pbisController.quality);
