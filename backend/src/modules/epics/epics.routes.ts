import { Router } from "express";
import { EpicsController } from "./epics.controller.js";
import { EpicsService, epicsService } from "./epics.service.js";
import { requireRole } from "../../middleware/requireRole.js";

export function createEpicsRouter(service: EpicsService = epicsService) {
const epicsRouter = Router();
const epicsController = new EpicsController(service);

const canWrite = requireRole("admin", "po");

/**
 * @swagger
 * /api/v1/epics:
 *   post:
 *     summary: Criar novo épico
 *     tags: [Epics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projeto_id
 *               - titulo
 *             properties:
 *               projeto_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID do projeto
 *               titulo:
 *                 type: string
 *                 maxLength: 255
 *                 description: Título do épico
 *               descricao:
 *                 type: string
 *                 nullable: true
 *                 description: Descrição do épico
 *               objetivo:
 *                 type: string
 *                 nullable: true
 *                 description: Objetivo do épico
 *               escopo_macro:
 *                 type: string
 *                 nullable: true
 *                 description: Escopo macro do épico
 *               resultado_esperado:
 *                 type: string
 *                 nullable: true
 *                 description: Resultado esperado do épico
 *               prioridade:
 *                 type: string
 *                 enum: [Must, Should, Could]
 *                 default: Must
 *                 description: Prioridade do épico
 *               status:
 *                 type: string
 *                 enum: [rascunho]
 *                 default: rascunho
 *                 description: Status do épico
 *     responses:
 *       201:
 *         description: Épico criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Epic'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 */
epicsRouter.post("/", canWrite, epicsController.create);

/**
 * @swagger
 * /api/v1/epics:
 *   get:
 *     summary: Listar épicos
 *     tags: [Epics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projeto_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filtrar por projeto
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [rascunho, concluido, ativo, arquivado]
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
 *         description: Lista de épicos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Epic'
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       401:
 *         description: Não autenticado
 */
epicsRouter.get("/", epicsController.list);

/**
 * @swagger
 * /api/v1/epics/{id}:
 *   get:
 *     summary: Obter épico por ID
 *     tags: [Epics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do épico
 *     responses:
 *       200:
 *         description: Épico encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Epic'
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Épico não encontrado
 */
epicsRouter.get("/:id", epicsController.getById);

/**
 * @swagger
 * /api/v1/epics/{id}:
 *   put:
 *     summary: Atualizar épico
 *     tags: [Epics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do épico
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
 *               escopo_macro:
 *                 type: string
 *                 nullable: true
 *               resultado_esperado:
 *                 type: string
 *                 nullable: true
 *               prioridade:
 *                 type: string
 *                 enum: [Must, Should, Could]
 *               justificativa:
 *                 type: string
 *                 nullable: true
 *                 description: Justificativa da alteração. Obrigatória para itens concluídos quando a organização exigir.
 *     responses:
 *       200:
 *         description: Épico atualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Epic'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Épico não encontrado
 */
epicsRouter.put("/:id", canWrite, epicsController.update);

/**
 * @swagger
 * /api/v1/epics/{id}:
 *   patch:
 *     summary: Atualizar épico parcialmente
 *     tags: [Epics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do épico
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
 *               escopo_macro:
 *                 type: string
 *                 nullable: true
 *               resultado_esperado:
 *                 type: string
 *                 nullable: true
 *               prioridade:
 *                 type: string
 *                 enum: [Must, Should, Could]
 *               justificativa:
 *                 type: string
 *                 nullable: true
 *                 description: Justificativa da alteração. Obrigatória para itens concluídos quando a organização exigir.
 *     responses:
 *       200:
 *         description: Épico atualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Epic'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Épico não encontrado
 */
epicsRouter.patch("/:id", canWrite, epicsController.update);

/**
 * @swagger
 * /api/v1/epics/{id}/complete:
 *   patch:
 *     summary: Marcar épico como concluído
 *     tags: [Epics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do épico
 *     responses:
 *       200:
 *         description: Épico marcado como concluído
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Epic'
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Épico não encontrado
 */
epicsRouter.patch("/:id/complete", canWrite, epicsController.complete);

return epicsRouter;
}

export const epicsRouter = createEpicsRouter();
