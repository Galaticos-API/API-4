import { Router } from 'express';
import { RepoAnalysesService } from './repo-analyses.service';
import { requireAuth } from '../../middleware/requireAuth'; // Ajuste conforme o middleware de auth do projeto

export const repoAnalysesRouter = Router({ mergeParams: true });
const service = new RepoAnalysesService();

// Iniciar nova análise
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

// Listar análises do projeto
repoAnalysesRouter.get('/', requireAuth, async (req: any, res) => {
    try {
        const { projectId } = req.params;
        const analyses = await service.listByProject(projectId);
        return res.json(analyses);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

// Obter detalhes de uma análise específica
repoAnalysesRouter.get('/:id', requireAuth, async (req: any, res) => {
    try {
        const { id } = req.params;
        const analysis = await service.getById(id);
        if (!analysis) {
            return res.status(404).json({ error: 'Análise não encontrada' });
        }
        return res.json(analysis);
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});
