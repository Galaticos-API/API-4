import { randomUUID } from 'node:crypto';
import { serviceHeaders } from "../../shared/service-auth.js";
import axios from 'axios';
import { AppError, ValidationError } from '../../shared/errors';
import { env } from '../../config/env';
import { RepoAnalysesRepository } from './repo-analyses.repository';
import { RepoAnalysisRecord, RepoAnalysisStatus, RepoAnalysisStep } from './repo-analyses.types';

const ANALYZER_STATUS: Record<string, RepoAnalysisStatus> = {
    queued: 'iniciado',
    running: 'em_execucao',
    pausing: 'pausando',
    paused: 'pausada',
    cancelling: 'cancelando',
    cancelled: 'cancelada',
    completed: 'concluido',
    failed: 'falha',
};

const ACTIVE_STATUSES: RepoAnalysisStatus[] = ['iniciado', 'em_execucao', 'pausando', 'cancelando'];

export function mapAnalyzerStatus(status: string): RepoAnalysisStatus {
    const mapped = ANALYZER_STATUS[status];
    if (!mapped) throw new Error(`Status desconhecido recebido do serviço de análise: ${status}`);
    return mapped;
}

export function mapAnalyzerProgress(
    stageIndex: number,
    stageCount: number,
    status: RepoAnalysisStatus,
    stats?: Record<string, unknown>,
): number {
    if (status === 'concluido') return 100;
    if (!Number.isFinite(stageIndex) || !Number.isFinite(stageCount) || stageCount <= 0) return 0;
    const completedStages = Math.max(0, Math.min(stageCount, stageIndex - 1));
    const stageProgress = stageIndex === 4 && typeof stats?.calls_progress_percent === 'number'
        ? Math.max(0, Math.min(100, stats.calls_progress_percent)) / 100
        : 0;
    return Math.max(0, Math.min(99, Math.round(((completedStages + stageProgress) / stageCount) * 100)));
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

    async startAnalysis(projetoId: string, usuarioId: string, repositorioUrl: string, profile: 'quick' | 'balanced' | 'complete' = 'quick', requestKey: string = randomUUID()): Promise<RepoAnalysisRecord> {
        if (!this.validateGithubUrl(repositorioUrl)) {
            throw new ValidationError('URL do repositório GitHub inválida. Utilize o formato https://github.com/usuario/repositorio');
        }

        return this.repository.create({ projetoId, usuarioId, repositorioUrl: repositorioUrl.trim(),
            runId: randomUUID(), requestKey, profile });
    }

    async processQueue(): Promise<void> {
        const record = await this.repository.claimDispatch();
        if (record) {
            try {
                const response = await axios.post(`${this.analyzerBaseUrl}/api/analyze`,
                    { url: record.repositorio_url, profile: record.perfil, run_id: record.run_id },
                    { headers: serviceHeaders(), timeout: 15_000 });
                if (response.data.run_id !== record.run_id) throw new Error('Identidade da execução divergente');
                const latest = await this.repository.findById(record.id, record.projeto_id);
                if (latest?.cancel_requested) {
                    // Repeated cancel is safe: Python returns the terminal state when already cancelled.
                    await axios.post(`${this.analyzerBaseUrl}/api/runs/${record.run_id}/cancel`, {}, { headers: serviceHeaders(), timeout: 15_000 });
                } else if (latest?.resume_requested) {
                    await axios.post(`${this.analyzerBaseUrl}/api/runs/${record.run_id}/resume`, {}, { headers: serviceHeaders(), timeout: 15_000 });
                }
                await this.repository.finishDispatch(record, undefined, false, latest?.cancel_requested);
            } catch (error) {
                const code = axios.isAxiosError(error) ? error.response?.status : undefined;
                await this.repository.finishDispatch(record, 'Não foi possível despachar a análise; aguardando nova tentativa.',
                    code !== undefined && [400, 409, 422].includes(code));
            }
        }
        for (const analysis of await this.repository.findSyncable()) await this.syncAnalysisStatus(analysis);
    }

    private needsSync(analysis: RepoAnalysisRecord): boolean {
        return !analysis.dispatch_pending && (ACTIVE_STATUSES.includes(analysis.status) ||
            (analysis.status === 'concluido' && !analysis.relatorio_markdown));
    }

    async listByProject(projetoId: string): Promise<RepoAnalysisRecord[]> {
        const analyses = await this.repository.findByProjectId(projetoId);

        // Opcional: Atualizar status das análises em andamento consultando o ai-service
        await Promise.all(analyses
            .filter((analysis) => this.needsSync(analysis))
            .map((analysis) => this.syncAnalysisStatus(analysis)));

        return await this.repository.findByProjectId(projetoId);
    }

    async getById(projetoId: string, id: string): Promise<RepoAnalysisRecord | null> {
        const analysis = await this.repository.findById(id, projetoId);
        if (analysis && this.needsSync(analysis)) {
            await this.syncAnalysisStatus(analysis);
            return await this.repository.findById(id, projetoId);
        }
        return analysis;
    }

    async controlAnalysis(projetoId: string, id: string, action: 'pause' | 'resume' | 'cancel'): Promise<RepoAnalysisRecord | null> {
        const analysis = await this.repository.findById(id, projetoId);
        if (!analysis) return null;
        if (action === 'resume') return this.repository.queueResume(id, projetoId);
        if (analysis.dispatch_pending && action === 'cancel') {
            const cancelled = await this.repository.cancelPending(id, projetoId);
            if (cancelled) return cancelled;
        } else if (analysis.dispatch_pending) throw new AppError('A análise aguarda despacho. Tente novamente em instantes.', 409, 'ANALYSIS_QUEUED');
        if (!analysis.run_id) throw new AppError('Esta análise não possui execução retomável.', 409, 'ANALYSIS_NOT_RESUMABLE');
        try {
            await axios.post(`${this.analyzerBaseUrl}/api/runs/${encodeURIComponent(analysis.run_id)}/${action}`, {}, { headers: serviceHeaders(), timeout: 15_000 });
            await this.syncAnalysisStatus(analysis);
            return await this.repository.findById(id, projetoId);
        } catch (error: unknown) {
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            const detail = axios.isAxiosError(error) && typeof error.response?.data?.detail === 'string'
                ? error.response.data.detail : 'serviço indisponível';
            if (status === 409) throw new AppError(detail, 409, 'ANALYSIS_CONTROL_CONFLICT');
            throw new AppError(`Falha ao ${action === 'pause' ? 'pausar' : 'cancelar'} análise: ${detail}`, 503, 'ANALYZER_UNAVAILABLE');
        }
    }

    private async syncAnalysisStatus(analysis: RepoAnalysisRecord): Promise<void> {
        const runId = analysis.run_id;
        try {
            const response = await axios.get(`${this.analyzerBaseUrl}/api/runs/${runId}`, { headers: serviceHeaders(), timeout: 15_000 });
            const data = response.data;
            const status = mapAnalyzerStatus(data.status);
            const etapa = (data.stage || 'queued') as RepoAnalysisStep;
            const stats = data.stats && typeof data.stats === 'object' ? data.stats as Record<string, unknown> : undefined;

            let relatorioMarkdown = undefined;
            if (status === 'concluido') {
                try {
                    const reportRes = await axios.get(`${this.analyzerBaseUrl}/api/runs/${runId}/report`, { headers: serviceHeaders(), timeout: 15_000 });
                    const report = typeof reportRes.data === 'string' ? reportRes.data : reportRes.data.report;
                    if (typeof report === 'string' && report.trim()) relatorioMarkdown = report;
                } catch (e) {
                    // Ignora se o relatório ainda não estiver pronto
                }
            }

            await this.repository.updateStatus(runId, {
                status,
                etapa,
                etapaLabel: data.stage_label || etapa,
                progresso: mapAnalyzerProgress(Number(data.stage_index), Number(data.stage_count), status, stats),
                mensagem: data.message,
                erro: data.error,
                relatorioMarkdown,
                metadados: stats,
            }, analysis.revision ?? 0);
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                await this.repository.updateStatus(runId, {
                    status: 'falha',
                    etapa: 'error',
                    etapaLabel: 'Execução indisponível',
                    progresso: 0,
                    mensagem: 'O motor de análise não encontrou esta execução. Inicie uma nova análise para continuar.',
                    erro: 'Execução não encontrada no serviço de análise.',
                }, analysis.revision ?? 0);
                return;
            }
            console.warn('[RepoAnalyzer] Falha ao sincronizar o status de uma análise; nova tentativa na próxima consulta.');
        }
    }
}

export function startRepoAnalysesWorker(): () => void {
    const service = new RepoAnalysesService();
    let busy = false;
    const tick = async () => {
        if (busy) return;
        busy = true;
        try { await service.processQueue(); }
        catch { console.warn('[RepoAnalyzer] Falha no worker; a solicitação durável será retomada.'); }
        finally { busy = false; }
    };
    const timer = setInterval(() => void tick(), 5000);
    timer.unref();
    void tick();
    return () => clearInterval(timer);
}
