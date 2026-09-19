import axios from 'axios';
import { env } from '../../config/env';
import { RepoAnalysesRepository } from './repo-analyses.repository';
import { RepoAnalysisRecord } from './repo-analyses.types';

export class RepoAnalysesService {
    private repository = new RepoAnalysesRepository();
    private analyzerBaseUrl = env.REPO_ANALYZER_URL;

    private validateGithubUrl(url: string): boolean {
        const githubRegex = /^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+\/?$/i;
        return githubRegex.test(url.trim());
    }

    async startAnalysis(projetoId: string, usuarioId: string, repositorioUrl: string): Promise<RepoAnalysisRecord> {
        if (!this.validateGithubUrl(repositorioUrl)) {
            throw new Error('URL do repositório GitHub inválida. Utilize o formato https://github.com/usuario/repositorio');
        }

        // Dispara a execução no ai-service / RepoAnalyzer
        try {
            const response = await axios.post(`${this.analyzerBaseUrl}/api/analyze`, {
                repository_url: repositorioUrl,
            });

            const { run_id } = response.data;

            const record = await this.repository.create({
                projetoId,
                usuarioId,
                repositorioUrl,
                runId: run_id,
            });

            return record;
        } catch (error: any) {
            throw new Error(`Falha ao iniciar análise no motor de IA: ${error.response?.data?.detail || error.message}`);
        }
    }

    async listByProject(projetoId: string): Promise<RepoAnalysisRecord[]> {
        const analyses = await this.repository.findByProjectId(projetoId);

        // Opcional: Atualizar status das análises em andamento consultando o ai-service
        for (const analysis of analyses) {
            if (analysis.status === 'iniciado' || analysis.status === 'em_execucao') {
                await this.syncAnalysisStatus(analysis.run_id);
            }
        }

        return await this.repository.findByProjectId(projetoId);
    }

    async getById(id: string): Promise<RepoAnalysisRecord | null> {
        const analysis = await this.repository.findById(id);
        if (analysis && (analysis.status === 'iniciado' || analysis.status === 'em_execucao')) {
            await this.syncAnalysisStatus(analysis.run_id);
            return await this.repository.findById(id);
        }
        return analysis;
    }

    private async syncAnalysisStatus(runId: string): Promise<void> {
        try {
            const response = await axios.get(`${this.analyzerBaseUrl}/api/runs/${runId}`);
            const data = response.data;

            let relatorioMarkdown = undefined;
            if (data.status === 'concluido') {
                try {
                    const reportRes = await axios.get(`${this.analyzerBaseUrl}/api/runs/${runId}/report`);
                    relatorioMarkdown = reportRes.data.report || reportRes.data;
                } catch (e) {
                    // Ignora se o relatório ainda não estiver pronto
                }
            }

            await this.repository.updateStatus(runId, {
                status: data.status,
                etapa: data.etapa,
                etapaLabel: data.etapa_label,
                progresso: data.progresso,
                mensagem: data.mensagem,
                erro: data.erro,
                relatorioMarkdown,
                metadados: data.metadados,
            });
        } catch (error) {
            console.error(`Erro ao sincronizar status do run ${runId}:`, error);
        }
    }
}