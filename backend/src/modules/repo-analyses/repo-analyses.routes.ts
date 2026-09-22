import { Router } from 'express';
import { RepoAnalysesService } from './repo-analyses.service';
import { requireAuth } from '../../middleware/requireAuth'; // Ajuste conforme o middleware de auth do projeto

export const repoAnalysesRouter = Router({ mergeParams: true });
const service = new RepoAnalysesService();

/**
 * @swagger
 * /api/v1/projects/{projectId}/repo-analyses:
 *   post:
 *     summary: Iniciar nova análise de repositório
 *     tags: [Repo Analyses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
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
 *             required:
 *               - repositorio_url
 *             properties:
 *               repositorio_url:
 *                 type: string
 *                 format: uri
 *                 description: URL do repositório a ser analisado
 *     responses:
 *       201:
 *         description: Análise iniciada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 projeto_id:
 *                   type: string
 *                   format: uuid
 *                 usuario_id:
 *                   type: string
 *                   format: uuid
 *                 repositorio_url:
 *                   type: string
 *                 status:
 *                   type: string
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Dados inválidos ou erro ao iniciar análise
 *       401:
 *         description: Não autenticado
 */
repoAnalysesRouter.post('/', requireAuth, async (req: any, res) => {
    try {
        const { projectId } = req.params;
        const usuarioId = req.user.id; // Extraído da sessão autenticada
        const { repositorio_url } = req.body;

        const analysis = await service.startAnalysis(projectId, usuarioId, repositorio_url);
        return res.status(201).json(analysis);
    } catch (error: any) {
        return res.status(400).json({ error: error.message });
    }
});

/**
 * @swagger
 * /api/v1/projects/{projectId}/repo-analyses:
 *   get:
 *     summary: Listar análises de repositório do projeto
 *     tags: [Repo Analyses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do projeto
 *     responses:
 *       200:
 *         description: Lista de análises
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   projeto_id:
 *                     type: string
 *                     format: uuid
 *                   usuario_id:
 *                     type: string
 *                     format: uuid
 *                   repositorio_url:
 *                     type: string
 *                   status:
 *                     type: string
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro interno do servidor
 */
repoAnalysesRouter.get('/', requireAuth, async (req: any, res) => {
    try {
        const { projectId } = req.params;
        const analyses = await service.listByProject(projectId);
        return res.json(analyses);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /api/v1/projects/{projectId}/repo-analyses/{id}:
 *   get:
 *     summary: Obter detalhes de uma análise específica
 *     tags: [Repo Analyses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID do projeto
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID da análise
 *     responses:
 *       200:
 *         description: Detalhes da análise
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 projeto_id:
 *                   type: string
 *                   format: uuid
 *                 usuario_id:
 *                   type: string
 *                   format: uuid
 *                 repositorio_url:
 *                   type: string
 *                 status:
 *                   type: string
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Não autenticado
 *       404:
 *         description: Análise não encontrada
 *       500:
 *         description: Erro interno do servidor
 */
repoAnalysesRouter.get('/:id', requireAuth, async (req: any, res) => {
    try {
        const { id, projectId } = req.params;
        const analysis = await service.getById(projectId, id);
        if (!analysis) {
            return res.status(404).json({ error: 'Análise não encontrada' });
        }
        return res.json(analysis);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});
