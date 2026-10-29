# Relatório de correções QA — Merge S2-17

**Data:** 25/10/2026  
**Branch:** `main`  
**Base revisada:** `84e031d`  
**Escopo:** remediação dos achados registrados em `QA-MERGE-S2-17-2026-10-25.md`.

## Resultado

Os achados de segurança de dependências, gates de CI e critérios de aceite de relevância foram corrigidos. Builds, auditorias, testes unitários, integrações PostgreSQL e avaliação real com Ollama passaram localmente.

O risco de desempenho em escala permanece **não comprovado**: a bateria publicada usa seis chunks, então não permite afirmar desempenho em corpus de produção. Nenhuma mudança SQL de otimização foi feita sem evidência de gargalo ou plano de execução representativo. Esse ponto deve ser tratado como validação de capacidade pendente antes do aceite de produção.

## Correções aplicadas

### Dependências vulneráveis

- Backend: `npm audit fix` atualizou dependências transitivas compatíveis; Zod foi atualizado para `^4.6.7` para eliminar vulnerabilidade sem correção na linha anterior.
- Schemas migrados das opções removidas no Zod 4 para callbacks `error`, preservando mensagens de campo obrigatório e validações de tipo.
- Frontend: Vitest e `@vitest/mocker` atualizados para `4.1.12`.
- `npm ci` foi executado em ambos os pacotes sem flags especiais.
- `npm audit` no backend e no frontend: **0 vulnerabilidades**.

### Gates de CI

O workflow agora exige testes unitários do backend e frontend, auditorias completas de dependências e integrações PostgreSQL/pgvector de indexing, qualidade/RAG e busca. A suíte Python da avaliação versionada permanece no CI.

### Critérios de aceite da busca

O avaliador agora calcula `Precision@returned` junto de `Precision@5` e aplica gate versionado, configurável pelo CLI com `--require-acceptance`. A ferramenta S2-17 também falha a execução se qualquer rodada não cumprir relevância, isolamento ou orçamento de latência.

Os limites adotados são critérios operacionais iniciais, e não constantes universais publicadas: mínimo de 20 consultas respondíveis e 5 sem evidência; Recall@5 ≥ 0,95; Precision@returned ≥ 0,90; MRR@5 ≥ 0,90; acurácia de ausência 1,0; zero violações de isolamento; cada consulta abaixo de 2.000 ms. Com 20 consultas positivas, Recall de 0,95 admite no máximo uma consulta sem evidência; `Precision@returned` evita contar posições vazias como documentos irrelevantes quando a API devolve listas curtas. O conjunto atual tem 20 consultas positivas e 6 negativas. A literatura recomenda métricas de ranking, mas não fornece um cutoff universal para todo domínio; ver [BEIR](https://arxiv.org/abs/2104.08663) e [Databricks — avaliação RAG](https://docs.databricks.com/gcp/en/agents/tutorials/ai-cookbook/evaluate-assess-performance).

Os thresholds foram definidos como o usuário autorizou, na ausência de valores aprovados pelo PO. Devem ser revistos após avaliação cega com corpus e consultas representativos.

## Verificações finais

| Verificação | Resultado |
|---|---:|
| Backend `npm test` | 86 passaram, 0 falharam, 26 ignorados por dependerem de DB/serviço |
| Backend typecheck e build | Passaram |
| Backend `npm audit` | 0 vulnerabilidades |
| Frontend `npm test` | 157 passaram |
| Frontend build | Passou |
| Frontend `npm audit` | 0 vulnerabilidades |
| Python `unittest discover -s ai-service/tests` | 36 passaram |
| `npm run test:evaluation` | 2 passaram |
| Integração PostgreSQL de busca | 26 passaram, 0 ignorados |
| Integrações indexing e módulos relacionados | 108 passaram, 1 ignorado (modelo IA real opcional nessa bateria) |
| Integração de qualidade/RAG + Ollama real | 31 passaram, 0 ignorados |
| `git diff --check` | Passou |

### Avaliação S2-17 ponta a ponta

Executada sobre API, PostgreSQL/pgvector descartável, embeddings BGE-M3 via Ollama, 26 consultas por rodada e concorrência 1. Os recursos descartáveis foram removidos ao final.

| Métrica | Rodada 1 | Rodada 2 | Rodada 3 |
|---|---:|---:|---:|
| Recall@5 | 1,00 | 1,00 | 1,00 |
| Precision@returned | 1,00 | 1,00 | 1,00 |
| Precision@5 | 0,20 | 0,20 | 0,20 |
| MRR@5 | 1,00 | 1,00 | 1,00 |
| Acurácia de ausência | 1,00 | 1,00 | 1,00 |
| Violações de isolamento | 0 | 0 | 0 |
| p50 | 107 ms | 95 ms | 103 ms |
| p95 | 196 ms | 212 ms | 182 ms |
| Consultas abaixo de 2 s | 26/26 | 26/26 | 26/26 |
| Gate de relevância | Aprovado | Aprovado | Aprovado |

`Precision@5` é 0,20 porque a API retorna um resultado correto por consulta positiva e a métrica de cutoff fixo divide por cinco; a precisão dos itens efetivamente mostrados é 1,00. A execução completa está em `ai-service/evaluation/results/s217-84e031d-v2-20261026011410405-46edeed9/` (diretório ignorado pelo Git).

## Limitações e próximo gate

O benchmark usa seis chunks no corpus PRE-06 e não cobre volumetria, crescimento por projeto nem concorrência de produção. Antes de declarar capacidade de produção, medir o SQL da busca com volumes representativos e `EXPLAIN (ANALYZE, BUFFERS)` em banco descartável. Também submeter dataset, gabaritos e thresholds à revisão do PO. Até isso ocorrer, o resultado comprova regressão funcional da bateria atual, não SLA de escala nem aceite de produto definitivo.

As alterações estão locais em `main`; não foram commitadas nem enviadas ao remoto.

## Incidente no ambiente local — 25/10/2026

Após a reconstrução das imagens, a UI revelou opções de projeto de fixtures E2E e falha ao consultar o chat. Diagnóstico e correção:

- O banco persistente estava somente até `021_pbi_relations.sql`; a busca atual referenciava `analise_repositorio.aprovado_por` e falhava com PostgreSQL `42703`.
- O runner de migrações executava migrações e seed no mesmo bloco transacional. Se o seed falhasse, o erro era engolido e o `COMMIT` revertia o schema junto. A transação de migração agora é confirmada antes do seed; em `NODE_ENV=production`, o seed de desenvolvimento é ignorado salvo habilitação explícita.
- Migrações foram aplicadas até `025_work_definitions.sql`. A busca foi reproduzida no projeto “Análise técnica — API 1” e agora retorna a resposta padrão de ausência **sem fontes nem evidências** para essa pergunta.
- Foram arquivadas, sem exclusão, as 20 fixtures ativas com `cliente='Cliente E2E'`. As 2 fixtures que já estavam arquivadas permaneceram como estavam. O seletor de projetos do chat também passou a excluir projetos arquivados.
- Verificação: typecheck e 86 testes unitários passaram (26 skips dependentes de DB); integração de qualidade/RAG passou com 31 testes (1 teste de Ollama real foi skip nessa execução). Backend, frontend, serviço IA e banco responderam saudáveis.

O seletor do chat mostra agora seis projetos ativos legítimos/de demonstração. As conversas históricas associadas às fixtures arquivadas não foram apagadas.
