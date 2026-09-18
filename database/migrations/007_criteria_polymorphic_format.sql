-- init.sql define criterio_aceitacao.texto como NOT NULL, mas o cenário BDD do PBI
-- (nome/dado/quando/entao) sempre grava texto = NULL. Sem esta migration, o INSERT
-- de um cenário de PBI falha em um banco real (só não falhava com repositório em memória).
-- Se linhas existentes violarem a constraint abaixo, o ALTER TABLE falha e interrompe a
-- migration sem apagar dados — nenhum saneamento automático é aplicado aqui.
ALTER TABLE criterio_aceitacao ALTER COLUMN texto DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_criterio_formato_polimorfico') THEN
    ALTER TABLE criterio_aceitacao ADD CONSTRAINT ck_criterio_formato_polimorfico CHECK (
      (entidade_tipo IN ('epico', 'feature') AND texto IS NOT NULL AND btrim(texto) <> '')
      OR
      (entidade_tipo = 'pbi'
        AND nome IS NOT NULL AND btrim(nome) <> ''
        AND dado IS NOT NULL AND btrim(dado) <> ''
        AND quando IS NOT NULL AND btrim(quando) <> ''
        AND entao IS NOT NULL AND btrim(entao) <> '')
    );
  END IF;
END $$;
