-- ==============================================================================
-- Migration 003: Regras e Índices para Projetos (S1-03 / PBI-01.1.1)
-- ==============================================================================

-- Remover índice único estrito anterior caso exista
DROP INDEX IF EXISTS uq_projeto_nome;

-- Criar índice único insensível a maiúsculas/minúsculas apenas para projetos ativos
CREATE UNIQUE INDEX IF NOT EXISTS uq_projeto_nome_ativo
ON projeto (LOWER(TRIM(nome)))
WHERE status != 'arquivado';
