-- Baseline HT-02.
-- O schema inicial permanece em database/init.sql porque o Docker Postgres
-- executa esse arquivo automaticamente na criação do volume.
-- A partir da migration 002, cada alteração deve ser registrada aqui como SQL
-- incremental e aplicada em ordem.
\ir ../init.sql
