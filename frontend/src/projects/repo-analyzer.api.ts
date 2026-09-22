import { apiRequest } from "../api/api_auth";

export interface RepoAnalysis {
    id: string;
    projeto_id: string;
    repositorio_url: string;
    run_id: string;
    status: "iniciado" | "em_execucao" | "concluido" | "falha";
    etapa: string;
    etapa_label: string;
    progresso: number;
    mensagem?: string;
    erro?: string;
    relatorio_markdown?: string;
    metadados?: Record<string, any>;
    created_at: string;
    updated_at: string;
    concluido_em?: string;
    autor_nome?: string;
    autor_email?: string;
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
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Lista de análises de repositório inválida");
    return data;
}

export async function getRepoAnalysis(projectId: string, analysisId: string, signal?: AbortSignal): Promise<RepoAnalysis> {
    const response = await apiRequest(`/projects/${encodeURIComponent(projectId)}/repo-analyses/${encodeURIComponent(analysisId)}`, {
        method: "GET",
        signal,
    });
    return await response.json();
}
