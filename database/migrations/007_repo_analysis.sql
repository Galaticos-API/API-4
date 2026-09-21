-- ==============================================================================
-- Migration 007: Tabela de Análises de Repositórios GitHub (RepoAnalyzer)
-- Vinculada ao Projeto e ao Autor (PO autenticado)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS analise_repositorio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    projeto_id UUID NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    repositorio_url VARCHAR(500) NOT NULL,
    run_id VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'iniciado', -- 'iniciado', 'em_execucao', 'concluido', 'falha'
    etapa VARCHAR(50) DEFAULT 'queued',
    etapa_label VARCHAR(100) DEFAULT 'Na fila',
    progresso INT DEFAULT 0,
    mensagem TEXT,
    erro TEXT,
    relatorio_markdown TEXT,
    metadados JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    concluido_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_analise_repositorio_projeto
    ON analise_repositorio(projeto_id);

CREATE INDEX IF NOT EXISTS idx_analise_repositorio_usuario
    ON analise_repositorio(usuario_id);

CREATE INDEX IF NOT EXISTS idx_analise_repositorio_created_at
    ON analise_repositorio(created_at DESC);
