import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { NotFoundError, ValidationError, validateUuid } from '../../shared/errors';
import { ArchiveConflict } from '../projects/archive.types';
import { ProjectsRepository } from '../projects/projects.repository';
import { RepoAnalysesService } from './repo-analyses.service';

export interface ProjectLookup {
    findById(id: string): Promise<{ id: string; status: string } | null>;
}

export function createRepoAnalysesRouter(
    service: RepoAnalysesService = new RepoAnalysesService(),
    projects: ProjectLookup = new ProjectsRepository(),
    authentication: RequestHandler = requireAuth,
): Router {
    const router = Router({ mergeParams: true });

    const loadProject = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const projectId = String(req.params.projectId);
            validateUuid(projectId, 'ID do projeto');
            const project = await projects.findById(projectId);
            if (!project) throw new NotFoundError('Projeto não encontrado.');
            res.locals.projectStatus = project.status;
            next();
        } catch (error) {
            next(error);
        }
    };

    router.use(authentication, loadProject);

    /**
     * @swagger
     * /api/v1/projects/{projectId}/repo-analyses:
     *   post:
     *     summary: Iniciar nova análise de repositório
     *     tags: [Repo Analyses]
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       201:
     *         description: Análise iniciada
     *       400:
     *         description: URL ou projeto inválido
     *       404:
     *         description: Projeto não encontrado
     *       409:
     *         description: Projeto arquivado é somente leitura
     *       503:
     *         description: Motor de análise indisponível
     */
    router.post('/', async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (res.locals.projectStatus === 'arquivado') {
                throw new ArchiveConflict('Projeto arquivado é somente leitura e não recebe novas análises.');
            }
            const url = req.body?.repositorio_url;
            if (typeof url !== 'string') throw new ValidationError('Informe a URL do repositório.');
            const analysis = await service.startAnalysis(String(req.params.projectId), req.auth?.id ?? '', url);
            res.status(201).json(analysis);
        } catch (error) {
            next(error);
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
     *     responses:
     *       200:
     *         description: Lista de análises do projeto
     *       404:
     *         description: Projeto não encontrado
     */
    router.get('/', async (req: Request, res: Response, next: NextFunction) => {
        try {
            res.json(await service.listByProject(String(req.params.projectId)));
        } catch (error) {
            next(error);
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
     *     responses:
     *       200:
     *         description: Detalhes da análise
     *       404:
     *         description: Projeto ou análise não encontrados
     */
    router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = String(req.params.id);
            validateUuid(id, 'ID da análise');
            const analysis = await service.getById(String(req.params.projectId), id);
            if (!analysis) throw new NotFoundError('Análise não encontrada.');
            res.json(analysis);
        } catch (error) {
            next(error);
        }
    });

    return router;
}

export const repoAnalysesRouter = createRepoAnalysesRouter();
