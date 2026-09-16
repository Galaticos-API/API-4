# Status das PREs

Visão rápida dos habilitadores da Sprint 1.

> **A fonte é o [Plano de Tarefas](PLANO_DE_TAREFAS_DESENVOLVIMENTO.md)**, na coluna
> *Situação* da tabela de PREs. Esta página é um resumo para consulta; quando divergirem,
> o plano vence. Atualize os dois na mesma passada ou apague esta.

| ID | Situação | Evidência |
|---|---|---|
| PRE-01 | ⚠️ Concluída com ressalva | Decisões registradas no backlog v1.1 e no quadro — mas Q1, Q4 e Q5 seguem na tabela de pendências do backlog, sem resposta da PRO4TECH |
| PRE-02 | ✅ Concluída | Migrations `001`–`004` e runner Node executados e registrados no banco ativo |
| PRE-03 | ✅ Concluída | Contrato OpenAPI versionado em `docs/api/openapi.yaml` (621 linhas) |
| PRE-04 | ✅ Concluída | Suítes de backend, frontend e IA executadas pela CI; revisão independente concluída |
| PRE-05 | 🟡 Em revisão | Design system e protótipo navegável entregues no PR #18, aguardando merge |
| PRE-06 | ✅ Concluída | Seed fictício executado duas vezes sem duplicidade; contagens validadas na CI |
| PRE-07 | ✅ Concluída | `BAAI/bge-m3` (1024 dimensões) validado em `docs/Spike Embeddings.md` |
| PRE-08 | ✅ Concluída | Auditoria de produção limpa, com override de dependências no backend |
| PRE-09 | ✅ Concluída | Compose validado; PostgreSQL, backend, frontend e n8n operacionais |

## A ressalva do PRE-01

O `PRE-01` é *"Registrar as decisões Q1–Q5 com a PRO4TECH"* e está marcado como concluído.
Registrar a pergunta não é o mesmo que ter a decisão: **Q1, Q4 e Q5 continuam abertas** na
seção de pendências do [backlog](backlog/README.md).

- **Q4** — existe um nível "Projeto" acima do Épico? Altera `PBI-01.1.1` e a raiz da hierarquia.
- **Q5** — padrão de identificação de itens da PRO4TECH. Altera a convenção de códigos.
- **Q1** — a plataforma é ferramenta principal de especificação ou repositório consultivo?

Enquanto não vierem, `PRE-02` e `PRE-05`, que dependem do `PRE-01`, avançam sobre uma
premissa e não sobre uma decisão.

## Sem correspondência

A bateria de 20 perguntas de regressão para busca e chat, prevista para a Sprint 2 e
bloqueando `FT-02.3` e `FT-04.1`, não tem habilitador `PRE-*`. Precisa ser criada no plano
ou o trabalho fica sem cartão.
