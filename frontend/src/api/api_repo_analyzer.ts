import { apiRequest } from "./api_auth";

export type RepoAnalysisStatus = "iniciado" | "em_execucao" | "pausando" | "pausada" | "cancelando" | "cancelada" | "concluido" | "falha";
export type RepoAnalysisProfile = "quick" | "balanced" | "complete";
export type RepoAnalysisAction = "pause" | "resume" | "cancel" | "indexing/retry" | "report/approve";

export interface RepoAnalysis {
    id: string;
    projeto_id: string;
    repositorio_url: string;
    run_id: string | null;
    status: RepoAnalysisStatus;
    etapa: string | null;
    etapa_label: string | null;
    progresso: number | null;
    mensagem?: string | null;
    erro?: string | null;
    relatorio_revisao?: number;
    relatorio_markdown?: string | null;
    metadados?: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
    concluido_em?: string | null;
    autor_nome?: string | null;
    autor_email?: string | null;
    indexacao_status?: 'nao_aplicavel' | 'aguardando_aprovacao' | 'pendente' | 'processando' | 'indexado' | 'falha';
    indexacao_erro?: string | null;
}

export async function startRepoAnalysis(projectId: string, repositoryUrl: string, profile: RepoAnalysisProfile = "quick", signal?: AbortSignal, requestKey?: string): Promise<RepoAnalysis> {
    const response = await apiRequest(`/projects/${encodeURIComponent(projectId)}/repo-analyses`, {
        method: "POST",
        headers: requestKey ? { "Idempotency-Key": requestKey } : undefined,
        body: JSON.stringify({ repositorio_url: repositoryUrl, perfil: profile }),
        signal,
    });
    return await response.json();
}

export async function controlRepoAnalysis(projectId: string, analysisId: string, action: RepoAnalysisAction, signal?: AbortSignal, reportRevision?: number): Promise<RepoAnalysis> {
    const response = await apiRequest(`/projects/${encodeURIComponent(projectId)}/repo-analyses/${encodeURIComponent(analysisId)}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "report/approve" ? { relatorio_revisao: reportRevision } : {}),
        signal,
    });
    return await response.json();
}

export async function listRepoAnalyses(projectId: string, signal?: AbortSignal): Promise<RepoAnalysis[]> {
    const response = await apiRequest(`/projects/${encodeURIComponent(projectId)}/repo-analyses`, {
        method: "GET",
        signal,
    });
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error("Lista de análises de repositório inválida");
    return data as RepoAnalysis[];
}

export async function getRepoAnalysis(projectId: string, analysisId: string, signal?: AbortSignal): Promise<RepoAnalysis> {
    const response = await apiRequest(`/projects/${encodeURIComponent(projectId)}/repo-analyses/${encodeURIComponent(analysisId)}`, {
        method: "GET",
        signal,
    });
    return await response.json();
}
