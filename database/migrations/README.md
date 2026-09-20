# Migrações do banco

As alterações estruturais do banco devem ser numeradas e aplicadas em ordem
(`001_...sql`, `002_...sql`, etc.). Cada arquivo deve ser idempotente quando
possível e conter apenas a alteração daquela versão.

## Baseline atual

`database/init.sql` é o baseline inicial do projeto e é executado pelo
PostgreSQL na criação de um volume novo. Ele corresponde à versão `001` do
schema (PRE-02). A migration `002` completa estruturas de domínio que não
faziam parte do DDL inicial.

Antes de alterar tabelas existentes, crie uma nova migration numerada. Não
edite `init.sql` para corrigir um banco já criado: volumes existentes não
executam novamente os scripts de inicialização.

## Validação

```powershell
docker compose up -d postgres
docker compose exec postgres psql -U sinapse -d sinapse -c '\dt'
```

Para ambientes existentes, a aplicação das migrations deve ser feita em uma
transação e registrada no controle de versão do ambiente antes do deploy.

## Consolidação S1-05

As duas migrations 005 são histórico publicado e não devem ser renomeadas.
O runner registra o nome completo. `004_z_prepare_criteria_order.sql` precisa
ordenar antes de `005_backlog_hierarchy_domain.sql` para preparar critérios
legados antes da criação do índice único. `006_reconcile_epic_status.sql`
uniformiza a constraint preservando os estados legados como somente leitura
na API de épicos. Veja [execução e recuperação](../CONSOLIDACAO_S1_05.md).

`npm run test:integration:s105` no backend valida banco vazio, histórico antigo,
histórico backlog e ambas as migrations, com repetição e rollback de auditoria.
Exige `S105_TEST_DATABASE_URL` apontando para PostgreSQL local descartável cujo
nome termina em `_s105_test`. O teste cria/remove somente schemas próprios.

## Retomada do #22 após o #23

`007_criteria_polymorphic_format.sql` torna `criterio_aceitacao.texto` opcional e
acrescenta a constraint polimórfica (texto obrigatório para épico/feature; nome,
dado, quando e então obrigatórios para PBI). O `init.sql` ainda declara `texto`
como `NOT NULL` — corrigir isso é responsabilidade desta migration, não do
baseline. Se alguma linha existente violar a constraint, o `ALTER TABLE` falha e
interrompe a migration sem apagar dados; não há saneamento automático aqui.
