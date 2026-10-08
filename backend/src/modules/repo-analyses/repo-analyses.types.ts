export type RepoAnalysisStatus = 'iniciado' | 'em_execucao' | 'pausando' | 'pausada' | 'cancelando' | 'cancelada' | 'concluido' | 'falha';
export type RepoAnalysisStep = 'ollama' | 'clone' | 'scan' | 'files' | 'synthesis' | 'done' | 'error' | 'queued';

export interface RepoAnalysisRecord {
    revision?: number;
    id: string;
    projeto_id: string;
    usuario_id: string;
    repositorio_url: string;
    run_id: string;
    status: RepoAnalysisStatus;
    etapa: RepoAnalysisStep;
    etapa_label: string;
    progresso: number;
    mensagem?: string;
    erro?: string;
    relatorio_markdown?: string;
    metadados?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    concluido_em?: string;
    autor_nome?: string;
    autor_email?: string;
    dispatch_pending?: boolean;
    dispatch_attempts?: number;
    dispatch_lease?: string;
    cancel_requested?: boolean;
    resume_requested?: boolean;
    perfil?: 'quick' | 'balanced' | 'complete';
}

export interface StartAnalysisDTO {
    repositorio_url: string;
    perfil?: 'quick' | 'balanced' | 'complete';
}
