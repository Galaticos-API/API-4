# Migrações do banco

As alterações estruturais do banco devem ser numeradas e aplicadas em ordem
(`001_...sql`, `002_...sql`, etc.). Cada arquivo deve ser idempotente quando
possível e conter apenas a alteração daquela versão.

## Baseline atual

`database/init.sql` é o baseline inicial do projeto e é executado pelo
PostgreSQL na criação de um volume novo. Ele corresponde à versão `001` do
schema (HT-02).

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
