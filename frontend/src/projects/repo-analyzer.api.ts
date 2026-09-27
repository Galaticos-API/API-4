import { apiRequest } from "../api/api_auth";

export type RepoAnalysisStatus = "iniciado" | "em_execucao" | "concluido" | "falha";

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
    relatorio_markdown?: string | null;
    metadados?: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
    concluido_em?: string | null;
    autor_nome?: string | null;
    autor_email?: string | null;
}

export async function startRepoAnalysis(projectId: string, repositoryUrl: string, signal?: AbortSignal): Promise<RepoAnalysis> {
    const response = await apiRequest(`/projects/${encodeURIComponent(projectId)}/repo-analyses`, {
        method: "POST",
        body: JSON.stringify({ repositorio_url: repositoryUrl }),
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
