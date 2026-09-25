# Plano de correção da PR #37 (S1-16)

## Escopo e regra de segurança

Correções feitas na branch isolada `codex/pr37-corrections`, iniciada no commit
`b6e6949` da PR #37 e integrada à `main` `ce30a2d` (merge da PR #36). O checkout
`codex/s1-28-frontend-source` e suas alterações locais foram preservados. Este
trabalho não faz merge da PR.

Cada etapa só avança depois de revisar o diff e executar os testes pertinentes.

## Etapa 0 — Confirmar os contratos

**Concluída.** `pronto` não existe nas constraints atuais. O catálogo de
tecnologias existe, mas não havia fluxo da aplicação para associar tecnologias
a épicos, features ou PBIs. O contrato adotado usa os estados persistidos e o
catálogo já existente, sem criar outro vocabulário ou fonte de dados.

## Etapa 1 — Integrar a main sem perder comportamento

**Concluída localmente.** Os conflitos de `EpicsView.tsx`, `FeaturesView.tsx` e
`PbisView.tsx` foram resolvidos usando as implementações atuais da `main` para
justificativas, configuração de qualidade e histórico de auditoria. Os
breadcrumbs de S1-16 foram reaplicados nas telas de detalhe. Builds e testes
frontend passaram na validação local com Node 20.

## Etapa 2 — Tornar o filtro de tecnologia funcional

**Concluída no código.** Foi adicionada uma rota autenticada de catálogo que
retorna somente ID e nome, um seletor reutilizável nos formulários dos três
níveis e persistência atômica de vínculos em criação/edição. IDs são validados,
duplicatas são normalizadas, lista vazia remove vínculos e falhas revertem a
transação. A migration `011_unique_entity_technology.sql` remove duplicatas
legadas e impõe a chave natural. Associações também são registradas na auditoria.

## Etapa 3 — Corrigir status do filtro

**Concluída.** `pronto` foi removido das opções e da lista aceita na sessão.
Valores antigos inválidos são descartados. As opções restantes correspondem à
união dos status válidos para épico, feature e PBI nas migrations atuais.

## Etapa 4 — Snapshot consistente e testes PostgreSQL

**Concluída no código.** `findBacklogTree` agora lê projeto, épicos, features e
PBIs na mesma conexão e transação `REPEATABLE READ READ ONLY`, com ordenação
estável, commit/rollback e liberação garantida. Foram adicionados testes para a
transação, leitura real da árvore, isolamento de projeto, tags nos três níveis,
remoção, rejeição de IDs inexistentes, rollback e migração sobre associações
duplicadas.

## Etapa 5 — Avaliação de escala

**Concluída e medida na CI.** O teste de integração adiciona
25 épicos, 125 features e 625 PBIs (além da fixture funcional mínima) e exige
resposta em menos de 2 s e menor que 5 MiB. Os índices
de hierarquia publicados e o novo índice único cobrem os caminhos de junção e
associação.

No PostgreSQL da CI, a consulta retornou 26 épicos, 126 features e 626 PBIs em
10,8 ms, com payload de 105.546 bytes. Isso valida o baseline sintético, não
substitui monitoramento de projetos reais em volumes maiores.

A árvore continua sendo retornada integralmente. Se o baseline falhar ou os
projetos reais forem maiores que esse volume, a correção apropriada é carregar
features/PBIs progressivamente com filtros no servidor; limitar silenciosamente
os resultados no cliente faria status/tecnologia parecerem filtros globais
quando só considerariam os dados carregados. A máquina Windows atual não tem
Docker nem PostgreSQL local; o gate foi executado no PostgreSQL da CI.

## Etapa 6 — QA final

**Concluída no commit `8f4e9f5`.** Com Node 20:

- Backend: build TypeScript aprovado; 168 testes passaram, 8 testes PostgreSQL
  foram ignorados porque não há banco local disponível.
- Frontend: build de produção aprovado; 102 testes passaram.
- OpenAPI: YAML parseado sem erro.

CI da PR: todos os checks passaram no commit `8f4e9f5`, incluindo migration
011 com duplicatas legadas, integração da árvore e baseline PostgreSQL. Nenhum
merge está autorizado por este plano; a PR permanece aberta para nova revisão.
