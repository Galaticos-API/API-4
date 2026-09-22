import { Router } from "express";
import { projectsController } from "./projects.controller.js";
import { requireRole } from "../../middleware/requireRole.js";

export const projectsRouter = Router();

const canWrite = requireRole("admin", "po");

/**
 * @swagger
 * /api/v1/projects:
 *   post:
 *     summary: Criar novo projeto
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - cliente
 *             properties:
 *               nome:
 *                 type: string
 *                 maxLength: 255
 *                 description: Nome do projeto
 *               cliente:
 *                 type: string
 *                 maxLength: 255
 *                 description: Nome do cliente
 *               descricao:
 *                 type: string
 *                 nullable: true
 *                 description: Descrição do projeto
 *               status:
 *                 type: string
 *                 enum: [ativo, em_andamento, concluido, arquivado]
 *                 default: ativo
 *                 description: Status do projeto
 *               data_inicio:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 description: Data de início do projeto
 *     responses:
 *       201:
 *         description: Projeto criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 */
projectsRouter.post("/", canWrite, projectsController.create);

/**
 * @swagger
 * /api/v1/projects:
 *   get:
 *     summary: Listar projetos
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ativo, em_andamento, concluido, arquivado]
 *         description: Filtrar por status
 *       - in: query
 *         name: busca
 *         schema:
 *           type: string
 *         description: Buscar por nome ou cliente
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
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [created_at_desc, created_at_asc, nome_asc, nome_desc]
 *           default: created_at_desc
 *         description: Ordenação dos resultados
 *     responses:
 *       200:
 *         description: Lista de projetos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Project'
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       401:
 *         description: Não autenticado
 */
projectsRouter.get("/", projectsController.list);

/**
 * @swagger
 * /api/v1/projects/{id}:
 *   get:
 *     summary: Obter projeto por ID
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do projeto
 *     responses:
 *       200:
 *         description: Projeto encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Projeto não encontrado
 */
projectsRouter.get("/:id", projectsController.getById);

/**
 * @swagger
 * /api/v1/projects/{id}:
 *   put:
 *     summary: Atualizar projeto
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do projeto
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *                 maxLength: 255
 *               cliente:
 *                 type: string
 *                 maxLength: 255
 *               descricao:
 *                 type: string
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [ativo, em_andamento, concluido, arquivado]
 *               data_inicio:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               justificativa:
 *                 type: string
 *                 nullable: true
 *                 description: Justificativa da alteração
 *     responses:
 *       200:
 *         description: Projeto atualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Projeto não encontrado
 */
projectsRouter.put("/:id", canWrite, projectsController.update);

/**
 * @swagger
 * /api/v1/projects/{id}:
 *   patch:
 *     summary: Atualizar projeto parcialmente
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do projeto
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *                 maxLength: 255
 *               cliente:
 *                 type: string
 *                 maxLength: 255
 *               descricao:
 *                 type: string
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [ativo, em_andamento, concluido, arquivado]
 *               data_inicio:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               justificativa:
 *                 type: string
 *                 nullable: true
 *                 description: Justificativa da alteração
 *     responses:
 *       200:
 *         description: Projeto atualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Projeto não encontrado
 */
projectsRouter.patch("/:id", canWrite, projectsController.update);

/**
 * @swagger
 * /api/v1/projects/{id}/archive:
 *   patch:
 *     summary: Arquivar projeto
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do projeto
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               justificativa:
 *                 type: string
 *                 nullable: true
 *                 description: Justificativa do arquivamento
 *     responses:
 *       200:
 *         description: Projeto arquivado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Projeto não encontrado
 */
projectsRouter.patch("/:id/archive", canWrite, projectsController.archive);
