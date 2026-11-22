# Task 3 — S3-08 PostgreSQL real e CI

## Estado

Implementação distribuída em dois commits: `412ccd98ef9010fb6f848d994a5ead33bab91f58` (`test: add developers PostgreSQL integration gate`) e `5d587b2ed0d40d57f0b4a01e396fac7659752cec` (`test: harden developer migration db cleanup`). O segundo commit registra 028 no ledger antes de aplicar migrations posteriores, endurece o cleanup de `withDatabase` e inclui regressão que verifica remoção do banco temporário quando o callback falha. A execução PostgreSQL real **não foi testada localmente**: Docker/PostgreSQL local estão indisponíveis e os dois testes dedicados reportaram `SKIP` sem `TEAM_TEST_DATABASE_URL`. Esse skip não é aprovação. A aprovação ainda depende do job PostgreSQL no CI da PR.

## Arquivos do commit

- `backend/src/modules/developers/developers.migration.db.test.ts` — cobertura PostgreSQL descartável para duplicatas pré-028, migração de competências/alocações para o perfil canônico, backfill do nome, índice único parcial e criação concorrente/auditoria.
- `backend/package.json` — comando `test:integration:developers`.
- `.github/workflows/report-review.yml` — job dedicado com `pgvector/pgvector:pg16`, healthcheck `pg_isready`, preflight de conexão e verificação de execução sem skip.
- `backend/src/database/migration-test-utils.ts` — lifecycle de conexão/banco temporário protegido por `try/finally`, fechamento garantido da conexão administrativa e tentativa de DROP se o banco foi criado.
- `task-3-report.md` — este registro da revisão e resultados.

## Verificações executadas e resultados observados

- `npm test` (em `backend/`, rodada desta revisão): exit code 0; 915 testes, 880 passaram, 0 falharam, 35 skipped.
- `npm run typecheck` (em `backend/`, rodada desta revisão): exit code 0.
- `npm run build` (em `backend/`, rodada desta revisão): exit code 0.
- `npm run test:integration:developers` sem `TEAM_TEST_DATABASE_URL`: exit code 0, 2 testes skipped, 0 passaram. **Resultado não aprovado; não demonstra execução PostgreSQL.**
- A suíte de backend incluiu o novo teste de callback, mas ele foi skipped junto com o teste de migration porque depende de `TEAM_TEST_DATABASE_URL`.
- Nesta rodada não foi reexecutado `git diff --check` nem o parse de YAML/JSON; ambos haviam passado na rodada anterior antes das alterações de teste/utilitário.
- Não foi executada conexão PostgreSQL local; não foi iniciado Docker nem usado banco compartilhado.

## SHA-256 dos arquivos commitados

- `.github/workflows/report-review.yml`: `3BEE03C3DB31D37638420BD0237F8ABDE245D3206069DD93BF6D7A561C44FE99`
- `backend/package.json`: `06AA5DB41D63BF038E6641BBD7CD57BDAC1138FE985467C00FA546EC131C8AF5`
- `backend/src/modules/developers/developers.migration.db.test.ts` (commit `5d587b2`): `C856FE548D032AE16EEA7608EF0846F98DAD7BE0F1870A9EA4033F04A36FD293`
- `backend/src/database/migration-test-utils.ts` (commit `5d587b2`): `418241AC1FF3058490A62A414355678FFDE241C6BD94E1605C3C6E6485A2EE4B`

## Gate pendente

Confirmar na PR que `PostgreSQL real — perfis profissionais` executou o teste (um passe, zero skips) contra o serviço PostgreSQL 16 efêmero. Até esse resultado, a integração de banco continua pendente.
