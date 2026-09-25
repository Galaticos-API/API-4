import axios from 'axios';
import { AppError, ValidationError } from '../../shared/errors';
import { env } from '../../config/env';
import { RepoAnalysesRepository } from './repo-analyses.repository';
import { RepoAnalysisRecord, RepoAnalysisStatus, RepoAnalysisStep } from './repo-analyses.types';

const ANALYZER_STATUS: Record<string, RepoAnalysisStatus> = {
    queued: 'iniciado',
    running: 'em_execucao',
    completed: 'concluido',
    failed: 'falha',
};

export function mapAnalyzerStatus(status: string): RepoAnalysisStatus {
    const mapped = ANALYZER_STATUS[status];
    if (!mapped) throw new Error(`Status desconhecido recebido do serviço de análise: ${status}`);
    return mapped;
}

export function mapAnalyzerProgress(stageIndex: number, stageCount: number, status: RepoAnalysisStatus): number {
    if (status === 'concluido') return 100;
    if (!Number.isFinite(stageIndex) || !Number.isFinite(stageCount) || stageCount <= 0) return 0;
    return Math.max(0, Math.min(99, Math.round((stageIndex / stageCount) * 100)));
}

export class RepoAnalysesService {
    constructor(
        private readonly repository: RepoAnalysesRepository = new RepoAnalysesRepository(),
        private readonly analyzerBaseUrl: string = env.REPO_ANALYZER_URL,
    ) {}

    private validateGithubUrl(url: string): boolean {
        const githubRegex = /^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+\/?$/i;
        return githubRegex.test(url.trim());
    }

    async startAnalysis(projetoId: string, usuarioId: string, repositorioUrl: string): Promise<RepoAnalysisRecord> {
        if (!this.validateGithubUrl(repositorioUrl)) {
            throw new ValidationError('URL do repositório GitHub inválida. Utilize o formato https://github.com/usuario/repositorio');
        }

        // Dispara a execução no ai-service / RepoAnalyzer
        try {
            const response = await axios.post(`${this.analyzerBaseUrl}/api/analyze`, { url: repositorioUrl }, { timeout: 15_000 });

            const { run_id } = response.data;

            const record = await this.repository.create({
                projetoId,
                usuarioId,
                repositorioUrl,
                runId: run_id,
            });

            return record;
        } catch (error: unknown) {
            const detail = axios.isAxiosError(error) && typeof error.response?.data?.detail === 'string' ? error.response.data.detail : 'serviço indisponível';
            throw new AppError(`Falha ao iniciar análise no motor de IA: ${detail}`, 503, 'ANALYZER_UNAVAILABLE');
        }
    }

    async listByProject(projetoId: string): Promise<RepoAnalysisRecord[]> {
        const analyses = await this.repository.findByProjectId(projetoId);

        // Opcional: Atualizar status das análises em andamento consultando o ai-service
        await Promise.all(analyses
            .filter((analysis) => analysis.status === 'iniciado' || analysis.status === 'em_execucao')
            .map((analysis) => this.syncAnalysisStatus(analysis.run_id)));

        return await this.repository.findByProjectId(projetoId);
    }

    async getById(projetoId: string, id: string): Promise<RepoAnalysisRecord | null> {
        const analysis = await this.repository.findById(id, projetoId);
        if (analysis && (analysis.status === 'iniciado' || analysis.status === 'em_execucao')) {
            await this.syncAnalysisStatus(analysis.run_id);
            return await this.repository.findById(id, projetoId);
        }
        return analysis;
    }

    private async syncAnalysisStatus(runId: string): Promise<void> {
        try {
            const response = await axios.get(`${this.analyzerBaseUrl}/api/runs/${runId}`, { timeout: 15_000 });
            const data = response.data;
            const status = mapAnalyzerStatus(data.status);
            const etapa = (data.stage || 'queued') as RepoAnalysisStep;
            const stats = data.stats && typeof data.stats === 'object' ? data.stats as Record<string, unknown> : undefined;

            let relatorioMarkdown = undefined;
            if (status === 'concluido') {
                try {
                    const reportRes = await axios.get(`${this.analyzerBaseUrl}/api/runs/${runId}/report`, { timeout: 15_000 });
                    relatorioMarkdown = reportRes.data.report || reportRes.data;
                } catch (e) {
                    // Ignora se o relatório ainda não estiver pronto
                }
            }

            await this.repository.updateStatus(runId, {
                status,
                etapa,
                etapaLabel: data.stage_label || etapa,
                progresso: mapAnalyzerProgress(Number(data.stage_index), Number(data.stage_count), status),
                mensagem: data.message,
                erro: data.error,
                relatorioMarkdown,
                metadados: stats,
            });
        } catch (error) {
            console.warn('[RepoAnalyzer] Falha ao sincronizar o status de uma análise; nova tentativa na próxima consulta.');
        }
    }
}
