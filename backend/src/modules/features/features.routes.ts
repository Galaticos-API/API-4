import { archiveHandlers } from "../projects/hierarchy-archive.js";
import { Router } from "express";
import { featuresController } from "./features.controller.js";
import { requireRole } from "../../middleware/requireRole.js";

export const featuresRouter = Router();

const canWrite = requireRole("admin", "po");

/**
 * @swagger
 * /api/v1/features:
 *   post:
 *     summary: Criar nova feature
 *     tags: [Features]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - epico_id
 *               - titulo
 *             properties:
 *               epico_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID do épico
 *               titulo:
 *                 type: string
 *                 maxLength: 255
 *                 description: Título da feature
 *               descricao:
 *                 type: string
 *                 nullable: true
 *                 description: Descrição da feature
 *               objetivo:
 *                 type: string
 *                 nullable: true
 *                 description: Objetivo da feature
 *               prioridade:
 *                 type: string
 *                 enum: [Must, Should, Could]
 *                 default: Must
 *                 description: Prioridade da feature
 *     responses:
 *       201:
 *         description: Feature criada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Feature'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 */
featuresRouter.post("/", canWrite, featuresController.create);

/**
 * @swagger
 * /api/v1/features:
 *   get:
 *     summary: Listar features
 *     tags: [Features]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: epico_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filtrar por épico
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
 *         description: Lista de features
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Feature'
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       401:
 *         description: Não autenticado
 */
featuresRouter.get("/", featuresController.list);

/**
 * @swagger
 * /api/v1/features/{id}:
 *   get:
 *     summary: Obter feature por ID
 *     tags: [Features]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da feature
 *     responses:
 *       200:
 *         description: Feature encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Feature'
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Feature não encontrada
 */
featuresRouter.get("/:id", featuresController.getById);

/**
 * @swagger
 * /api/v1/features/{id}:
 *   put:
 *     summary: Atualizar feature
 *     tags: [Features]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da feature
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
 *               descricao:
 *                 type: string
 *                 nullable: true
 *               objetivo:
 *                 type: string
 *                 nullable: true
 *               prioridade:
 *                 type: string
 *                 enum: [Must, Should, Could]
 *               justificativa:
 *                 type: string
 *                 nullable: true
 *                 description: Justificativa da alteração
 *     responses:
 *       200:
 *         description: Feature atualizada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Feature'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Feature não encontrada
 */
featuresRouter.put("/:id", canWrite, featuresController.update);

/**
 * @swagger
 * /api/v1/features/{id}:
 *   patch:
 *     summary: Atualizar feature parcialmente
 *     tags: [Features]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da feature
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
 *               descricao:
 *                 type: string
 *                 nullable: true
 *               objetivo:
 *                 type: string
 *                 nullable: true
 *               prioridade:
 *                 type: string
 *                 enum: [Must, Should, Could]
 *               justificativa:
 *                 type: string
 *                 nullable: true
 *                 description: Justificativa da alteração
 *     responses:
 *       200:
 *         description: Feature atualizada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Feature'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Feature não encontrada
 */
featuresRouter.patch("/:id", canWrite, featuresController.update);

/**
 * @swagger
 * /api/v1/features/{id}/complete:
 *   patch:
 *     summary: Marcar feature como concluída
 *     tags: [Features]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da feature
 *     responses:
 *       200:
 *         description: Feature marcada como concluída
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Feature'
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Feature não encontrada
 */
featuresRouter.patch("/:id/complete", canWrite, featuresController.complete);

const archive = archiveHandlers("feature");
featuresRouter.get("/:id/archive-impact", canWrite, archive.impact);
featuresRouter.patch("/:id/archive", canWrite, archive.archive);
