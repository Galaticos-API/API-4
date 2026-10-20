-- S2-23: Indexação automática de relatórios do RepoAnalyzer no acervo vetorial.
-- Adiciona controle de estado de indexação à analise_repositorio e prepara
-- a tabela chunk para receber trechos com entidade_tipo = 'analise_repositorio'.

ALTER TABLE analise_repositorio
  ADD COLUMN IF NOT EXISTS indexacao_status VARCHAR(20) NOT NULL DEFAULT 'nao_aplicavel',
  ADD COLUMN IF NOT EXISTS indexacao_tentativas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS indexacao_erro TEXT,
  ADD COLUMN IF NOT EXISTS indexacao_lease_id UUID,
  ADD COLUMN IF NOT EXISTS indexacao_bloqueado_ate TIMESTAMPTZ;

-- Análises já concluídas com relatório ficam pendentes de indexação.
UPDATE analise_repositorio
  SET indexacao_status = 'pendente'
  WHERE status = 'concluido' AND relatorio_markdown IS NOT NULL
    AND indexacao_status = 'nao_aplicavel';

-- Índice para o worker buscar análises pendentes de indexação eficientemente.
CREATE INDEX IF NOT EXISTS idx_analysis_indexing_pending
  ON analise_repositorio(created_at)
  WHERE indexacao_status IN ('pendente', 'processando');
