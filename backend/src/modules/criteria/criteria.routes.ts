import { Router } from "express";
import { criteriaController } from "./criteria.controller.js";
import { requireRole } from "../../middleware/requireRole.js";

export const criteriaRouter = Router();

const canWrite = requireRole("admin", "po");

/**
 * @swagger
 * /api/v1/criteria:
 *   post:
 *     summary: Criar novo critério de aceitação
 *     tags: [Criteria]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required:
 *                   - entidade_tipo
 *                   - entidade_id
 *                   - texto
 *                 properties:
 *                   entidade_tipo:
 *                     type: string
 *                     enum: [epico]
 *                   entidade_id:
 *                     type: string
 *                     format: uuid
 *                   texto:
 *                     type: string
 *                     maxLength: 1000
 *                     description: Texto do critério
 *               - type: object
 *                 required:
 *                   - entidade_tipo
 *                   - entidade_id
 *                   - texto
 *                 properties:
 *                   entidade_tipo:
 *                     type: string
 *                     enum: [feature]
 *                   entidade_id:
 *                     type: string
 *                     format: uuid
 *                   texto:
 *                     type: string
 *                     maxLength: 1000
 *                     description: Texto do critério
 *               - type: object
 *                 required:
 *                   - entidade_tipo
 *                   - entidade_id
 *                   - nome
 *                   - dado
 *                   - quando
 *                   - entao
 *                 properties:
 *                   entidade_tipo:
 *                     type: string
 *                     enum: [pbi]
 *                   entidade_id:
 *                     type: string
 *                     format: uuid
 *                   nome:
 *                     type: string
 *                     maxLength: 255
 *                     description: Nome do cenário
 *                   dado:
 *                     type: string
 *                     description: Bloco DADO do cenário
 *                   quando:
 *                     type: string
 *                     description: Bloco QUANDO do cenário
 *                   entao:
 *                     type: string
 *                     description: Bloco ENTÃO do cenário
 *     responses:
 *       201:
 *         description: Critério criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Criterion'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 */
criteriaRouter.post("/", canWrite, criteriaController.create);

/**
 * @swagger
 * /api/v1/criteria:
 *   get:
 *     summary: Listar critérios de aceitação
 *     tags: [Criteria]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entidade_tipo
 *         required: true
 *         schema:
 *           type: string
 *           enum: [epico, feature, pbi]
 *         description: Tipo de entidade
 *       - in: query
 *         name: entidade_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da entidade
 *     responses:
 *       200:
 *         description: Lista de critérios
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Criterion'
 *       400:
 *         description: Parâmetros inválidos
 *       401:
 *         description: Não autenticado
 */
criteriaRouter.get("/", criteriaController.list);

/**
 * @swagger
 * /api/v1/criteria/{id}:
 *   delete:
 *     summary: Deletar critério de aceitação
 *     tags: [Criteria]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do critério
 *     responses:
 *       200:
 *         description: Critério deletado com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Critério não encontrado
 */
criteriaRouter.delete("/:id", canWrite, criteriaController.delete);

/**
 * @swagger
 * /api/v1/criteria/{id}/move:
 *   patch:
 *     summary: Mover critério de aceitação (reordenar)
 *     tags: [Criteria]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do critério
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - direction
 *             properties:
 *               direction:
 *                 type: string
 *                 enum: [up, down]
 *                 description: Direção do movimento
 *     responses:
 *       200:
 *         description: Critério movido com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Criterion'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Critério não encontrado
 */
criteriaRouter.patch("/:id/move", canWrite, criteriaController.move);
