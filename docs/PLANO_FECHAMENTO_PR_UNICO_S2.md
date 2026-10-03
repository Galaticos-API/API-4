# Plano detalhado de fechamento e PR único — S2-01, S2-02, S2-06 e S2-17

**Criado:** 02/10/2026
**Revisão do plano:** 03/10/2026
**Objetivo:** concluir e validar S2-01, S2-02, S2-06 e S2-17, depois enviá-las juntas em um único PR para `main`.
**Estado revisado em:** 03/10/2026. Branch `codex/s2-17-ptbr-search-evaluation`, baseada em `origin/main` `4dc3033`. PR de rascunho será aberto a pedido do usuário, com os gates de latência e relevância explicitamente reprovados; não representa aprovação para merge nem aceite Scrum.

> **Nota da revisão:** este é o único plano operacional. `PLANO_CONTINUACAO_QA_S2.md` e os relatórios anteriores são registros históricos; não usar suas afirmações de aprovação quando divergirem deste documento e das evidências mais recentes. Os passos abaixo são gates de fechamento propostos, não uma redefinição automática do DoD do Trello.

## 1. Escopo e dependências

O planejamento do backlog identifica a seguinte dependência da avaliação S2-17:

```text
S2-01 ─┐
S2-02 ─┼──> avaliação final S2-17
S2-06 ─┘
```

S2-17 pode desenvolver harness, dataset e testes em paralelo, mas a execução que servirá de baseline final só pode ocorrer contra a implementação integrada de S2-01, S2-02 e S2-06. S2-01 e S2-02 formam o fluxo de ingestão; S2-06 implementa recuperação; S2-17 mede esse comportamento.

S2-03/S2-04 e S2-05 **não são dependências formais deste plano** e permanecem fora deste PR. S2-08 também não é declarada concluída; entra somente a adaptação mínima de `KnowledgeView` necessária para continuar funcionando com o novo contrato de busca, evitando regressão de UI. A implementação de indexação automática de itens do backlog permanece fora do PR e é descrita como limitação de escopo.

## 2. Estado de partida

| Tarefa | O que já está comprovado | O que falta antes do PR único |
|---|---|---|
| S2-01 | Integração PostgreSQL de documentos aprovada 17/17; leases/fencing, falha, retry manual e ausência de duplicação cobertos; fluxo real concluiu ingestão | Revisão de pares e CI no SHA final; reinício do processo durante uma lease permanece cobertura adicional recomendada |
| S2-02 | Smoke autenticado real passou por PDF/DOCX/MD/TXT: upload→processamento→busca/origem→remoção; 60 testes Python | Revisão de pares e CI no SHA final |
| S2-06 | Integração PostgreSQL aprovada 1/1; smoke real encontrou e removeu as quatro fontes no projeto descartável | Relevância ainda não aprovada: Q008 perdido e Q022 falso positivo no corpus pequeno; metas de produto e baseline ampliada pendentes |
| S2-17 | Dataset v1 preservado, v2 com 26 consultas; harness com métricas por categoria/proveniência; 62 testes Python; baseline autenticado de 26 consultas executado em 03/10 | Gate de latência falhou (p95 2.261 ms; 0/26 abaixo de 2 s), Q008 ausente/Q022 falso positivo; otimizar/corroborar ambiente e acordar critérios de relevância |

Registro de evidências de 02/10: [relatório final QA](RELATORIO_FINAL_QA_S2_2026-10-02.md). O diretório `tmp/` contém artefatos locais históricos e deve permanecer fora do PR.

## 3. Critérios globais para um PR único

O PR só será aberto quando:

1. As alterações incluídas estiverem classificadas por S2-01, S2-02, S2-06 e S2-17, com dependências e arquivos compartilhados explicados.
2. O ciclo de documento sintético provar upload autenticado → processamento → chunk e vetor persistidos → busca com origem correta → remoção → fonte ausente em busca posterior.
3. PDF, DOCX, Markdown e TXT passarem por validação repetível de processamento/extração e ao menos uma fixture passar pelo ciclo API completo. Completar busca/remoção para os quatro é recomendado se o smoke permitir; PDF sem texto/OCR deve falhar claramente.
4. Nenhuma violação de projeto ocorrer; filtros combinados retornarem apenas fontes dentro do escopo; ausência e recuperação forem reportadas por categoria.
5. Resultado final de S2-17 identificar o SHA exato da implementação avaliada, configuração e hashes das versões de dataset/corpus. Se o relatório for commitado depois da execução, confirmar que nenhum código/configuração mudou; não exigir que o relatório contenha seu próprio SHA final.
6. Backend, IA e frontend passarem nas suites relevantes, typecheck/build, migrações PostgreSQL vazias e build Docker.
7. Revisão final não incluir `tmp/`, cookies, credenciais, bancos locais, dados de usuário ou mudanças de outras tasks sem justificativa.
8. O PR único descrever cada tarefa, dependências, testes, limitações e tradeoffs e receber revisão por par.

Este plano não marca cartões do Trello automaticamente. O PR de rascunho é aberto por autorização explícita do usuário, apesar dos gates locais reprovados, para revisão e feedback; CI verde, revisão independente, correções e aceite Scrum continuam necessários antes de merge ou conclusão dos cartões.

### Classificação dos gates

- **Obrigatórios para o PR:** escopo rastreável, migrations completas e ordenadas, suites relevantes verdes, nenhum vazamento de projeto, dataset/relatório reproduzíveis, diff revisado e CI no PR.
- **Critérios de produto:** relevância mínima e comportamento de abstenção precisam vir do backlog ou ser acordados com PO/time antes de usar como bloqueio. `0.55` é provisório, não aceite.
- **Endurecimento QA recomendado:** repetição de corrida, casos adversariais adicionais e E2E expandido aumentam confiança. Se o DoD não exigir cada caso, registrar como cobertura adicional sem transformar automaticamente em novo escopo de sprint.
- **Higiene local:** temporários e storage de QA devem ser identificados e mantidos fora do PR. Limpeza não é critério funcional; não apagar arquivos sem comprovar que são descartáveis.

## 4. Fase 0 — Congelar baseline, inventariar e separar o escopo

### Passo a passo

1. Registrar branch, SHA da base `4dc3033`, estado remoto atualizado (`git fetch` seguido de comparação com `origin/main`), `git status` e diff stat, sem resetar ou sobrescrever o working tree atual.
2. Fazer inventário arquivo a arquivo e atribuir cada alteração a S2-01/02, S2-06, S2-17, suporte compartilhado ou fora do escopo.
3. Marcar mudanças compartilhadas que exigem revisão por hunks: `backend/src/index.ts`, `backend/package.json`, `backend/src/config/env.ts`, `database/init.sql`, `docker-compose.yml`, `docs/api/openapi.yaml`, `backend/src/database/seed-lib.ts` e documentação.
4. Verificar se os workers/repositórios S2-03/04 e o expurgo S2-05 são tecnicamente obrigatórios para executar S2-06 ou S2-17. Usar imports/runtime/testes como evidência, não a proximidade dos arquivos.
5. Classificar migrations e dependências reais pelo histórico/registro de migrations. Nunca omitir uma migration necessária à sequência só por pertencer a outra task: incluir a cadeia indispensável e explicar o vínculo, ou demonstrar que ela não é requisito do conjunto candidato. Não reordenar nem reescrever migrations aplicadas.
6. Garantir que artefatos em `tmp/` não serão staged. Não abrir nem exibir credenciais/cookies. Manter os temporários fora do PR; limpeza é separada e só ocorre para artefatos cuja origem descartável esteja comprovada. **Concluído em 03/10:** verificada ausência de conexões e de bancos QA temporários no servidor PostgreSQL.
7. Definir um mapa de inclusão do PR e uma lista explícita de caminhos excluídos, sem editar mudanças preexistentes ainda não classificadas.

### Saída

- Matriz de paths → task → dependência.
- Escopo mínimo do PR decidido.
- Nenhum arquivo removido ou alteração existente descartada.

## 5. Fase 1 — Fechar S2-01: pipeline e confiabilidade do worker

### Passo a passo

1. Criar banco PostgreSQL descartável novo, com nome terminado em `_test`, aplicar todas as migrations em ordem e guardar a saída sanitizada.
2. Rodar a integração de documentos isolada e confirmar `17/17` na revisão atual.
3. Cobrir transições `pendente → processando → processado/falha`, permissões de retry, documento de outro projeto e projeto arquivado.
4. Simular serviço IA indisponível após upload; confirmar estado `falha`, erro sem payload/segredo/caminho e ausência de chunks parciais.
5. Restaurar serviço IA, solicitar retry, acompanhar a conclusão e confirmar exatamente um conjunto de chunks.
6. Reiniciar worker com uma ingestão em andamento e comprovar retomada após expiração da lease.
7. Rodar dois workers simultâneos com documentos de fixture e verificar fencing: um único worker finaliza cada documento; uma lease antiga não pode sobrescrever a nova.
8. Conferir `health`, estados e retry na API/UI; mensagens devem explicar o estado sem exibir detalhe interno.
9. Repetir os testes de corrida em execuções independentes no banco descartável; três repetições são recomendação de confiança, não requisito de produto se o DoD não o exigir.
10. Revisar transações, logs, tratamento de exceção, storage temporário e isolamento entre projetos.

### Critério S2-01

- Nenhum processamento fica preso após falha/reinício; nenhum chunk parcial ou duplicado.
- Fencing e concorrência passam repetidamente.
- Retry permitido apenas em falha e não contorna isolamento, permissão ou arquivamento.
- Nenhum segredo ou conteúdo de arquivo aparece em log/resposta de erro.

## 6. Fase 2 — Fechar S2-02: extração, chunking e ciclo de documento

### Passo a passo

1. Preferir o comando de smoke/test harness já existente. Só criar novo script se o inventário provar que não há caminho repetível; evitar duplicar infraestrutura de teste.
2. Gerar um PDF com camada de texto, DOCX com parágrafos e tabela, Markdown e TXT; cada arquivo inclui uma frase exclusiva, sem conteúdo real de cliente.
3. Para cada arquivo, executar upload autenticado e registrar ID, status inicial e metadados, sem gravar cookie no resultado.
4. Esperar o worker finalizar com timeout finito; falhar o smoke se ultrapassar o timeout ou entrar em `falha`.
5. Consultar o banco para confirmar projeto/documento/origem, ordem de chunks, texto e dimensão vetorial 1024.
6. Buscar pela frase exclusiva com S2-06; verificar documento, projeto, link de origem e ausência de fontes de outro projeto.
7. Remover o documento pela API; confirmar remoção de chunks conforme contrato e nova busca sem a fonte removida. Cobrir o ciclo integral nos quatro formatos se o harness permitir sem custo excessivo; no mínimo, validar processamento e extração de cada formato e ciclo API integral em fixture representativa.
8. Adicionar testes negativos: arquivo vazio/corrompido, UTF-8 inválido, PDF criptografado/sem texto, DOCX inválido, extensão/MIME incompatível, mais de 20 MiB, texto acima do limite e mais de 500 chunks. Confirmar rejeição segura antes de chamar embeddings quando aplicável.
9. Testar chunking longo: cada trecho dentro do teto, texto final sem perda de cauda, sobreposição controlada, parágrafos respeitados e entrada sem espaços progride sem loop.
10. Testar contrato de resposta IA hostil/inválido: project/document ID divergente, chunk fora de ordem, texto acima do limite, embedding com dimensão errada/NaN e número excessivo de chunks. Confirmar que a persistência inteira é recusada.
11. Falhar uma persistência no meio e reprocessar; confirmar atomicidade e que os chunks antigos não se misturam aos novos.
12. Confirmar no guia que PDF sem OCR está fora do escopo e que limites backend/IA estão alinhados.

### Critério S2-02

- PDF, DOCX, MD e TXT têm processamento e extração validados; o ciclo API busca/origem/remoção passa no smoke repetível. Estender o ciclo integral a cada formato é cobertura recomendada, salvo exigência explícita do cartão.
- Texto de tabela DOCX está presente; PDF sem texto não vira falso sucesso.
- Limites, dimensões, origem, idempotência e atomicidade têm testes reproduzíveis.

## 7. Fase 3 — Corrigir e estabilizar S2-06

### Passo a passo

1. Preservar datasets e fixtures v1/v2; não reescrever gabarito para transformar falso positivo em sucesso.
2. Expandir o corpus curado com mais documentos de pelo menos dois projetos e temas deliberadamente próximos (positivos e negativos). Toda fonte deve ter origem, projeto, tipo e revisão rastreáveis.
3. Publicar a expansão como nova versão de corpus/dataset; mapear todos os IDs e manter v1/v2 imutáveis.
4. Aumentar o conjunto negativo e de paráfrases; incluir consultas com assunto parecido em outro projeto, termos curtos, identificadores válidos/inexistentes, conteúdo com/sem evidência e filtros.
5. Instrumentar em modo de teste o sinal lexical, vetorial, exato e fusão, sem expor telemetria de debug ao endpoint público nem registrar credenciais.
6. Diagnosticar Q008 (PDI) e Q022 (saldo/gráfico) pela evidência-fonte e scores individuais. Separar erro de representação do corpus, embedding e ranking.
7. Comparar os cortes existentes incluindo `0.55`, baselines `0.30`/`0.60` e alternativas orientadas por sinal. Não subir o threshold sozinho; analisar qual sinal causou cada FP/FN.
8. Se a correção exigir regra nova (por exemplo, precedência de match exato ou política de abstenção por evidência), adicionar teste unitário e teste PostgreSQL antes de ajustar o dataset.
9. Validar cada cenário com escopo de projeto aplicado antes da fusão, filtros de tecnologia/nível combinados e nenhuma fonte cruzada.
10. Conferir navegação de resultados: link aponta para a entidade/projeto corretos; empty, erro, loading e retry são estados claros.
11. Usar como gates invariáveis: zero violações de projeto e limite de latência definido no backlog/contrato (documentar métrica e método). p95 <2 s só é gate se estiver definido assim no requisito; caso contrário, é meta operacional proposta. Reportar Recall, Precision, MRR, falsos positivos, falsos negativos e abstenção por categoria.
12. Registrar Q008/Q022 como testes de regressão e repetir a matriz em toda mudança de ranking.

### Critério S2-06

- Busca exata por GRF e busca por conteúdo mantêm recuperação conforme gabarito curado.
- Filtros combinados e isolamento passam no PostgreSQL.
- Q008 e Q022 têm causa identificada e regressão classificada; correção não cria novos falsos positivos/falsos negativos silenciosos.
- Métricas e latência vêm do candidato final de código/corpus, não de uma execução antiga.

## 8. Fase 4 — Fechar S2-17 e executar baseline final

### Passo a passo

1. Preservar avaliador, runner e datasets versionados; revisar novos casos do corpus com origem/gabarito antes de publicar.
2. Garantir validação de IDs duplicados/ausentes, versão, resultados faltantes/duplicados, projeto divergente, fonte desconhecida, projeto de fonte conhecido, latência inválida e filtros inconsistentes.
3. Garantir que runner use API autenticada real, registre round-trip e limiar efetivo e nunca imprima/guarde cookie, token, URL privada ou conteúdo fora da fixture aprovada.
4. Registrar revisão do código/corpus, modelo de embedding, valores de limiar, estado de aquecimento, hora, revisão Git, versão dataset/corpus e hardware disponível. Se CPU/RAM do servidor de inferência não puderem ser medidos, registrar “não medido”; não inferir a partir da máquina executora.
5. Reexecutar cada consulta uma vez para scoring e repetir ao menos 3 vezes um subconjunto de latência; incluir warm-up explicitamente.
6. Gerar relatório por categoria e global: Recall@5, Precision@5, MRR@5, abstenção, FP/FN, p50/p95, limite 2 s e isolamento.
7. Comparar com v1/v2 e registrar variação em pontos percentuais e IDs que mudaram; registrar o tradeoff de `0.55` ou do limiar que o substituir.
8. Executar avaliador sobre os resultados produzidos e fazer o runner falhar para qualquer violação de isolamento, consulta ausente, versão incompatível ou latência fora do gate de infraestrutura.
9. Salvar no repositório somente dataset curado e relatório sanitizado; manter resultados brutos temporários fora do PR.
10. Rever independentemente gabarito/origem e código do avaliador antes do PR.

### Critério S2-17

- Dataset final versionado, com origem verificável e cobertura representativa das categorias do cartão. “20+ consultas” é referência prática, não requisito formal se o cartão não o disser nem garantia estatística; ampliar negativos para evitar conclusões baseadas em 1–2 exemplos.
- Baseline repetível contra o SHA, corpus e limiares candidatos ao PR.
- Zero vazamentos; latência dentro do orçamento; relatório apresenta por categoria todos os falsos positivos/negativos e limitações.
- Harness detecta os casos inválidos acima e não grava dados sensíveis.

## 9. Fase 5 — Revisão completa dos quatro fluxos

1. Aplicar todas as migrations numa base vazia terminada em `_test` e confirmar sequência idempotente.
2. Rodar integrações PostgreSQL de S2-01/02 e S2-06 no banco QA. A execução ampla mais recente teve 347 aprovações e uma falha em `knowledge-indexer.db.test.ts`, pertencente a S2-03/04; isso não demonstra dependência de S2-17. Registrar a falha fora de escopo e não reportar a suíte integrada como totalmente verde. Só voltar a rodar esse teste ao preparar S2-03/04 ou se um vínculo técnico indispensável for comprovado.
3. **Concluído nesta continuação:** executar `python scripts/smoke_document_lifecycle.py --confirm-disposable` contra backend/API, PostgreSQL, serviço IA e Ollama reais, com conta/projeto no banco descartável. PDF, DOCX, MD e TXT passaram por upload, processamento, busca com origem e remoção.
4. Executar suites backend, Python e frontend; typecheck e builds; teste de seed v1/v2; `npm audit --omit=dev` e auditoria Python disponível no projeto.
5. Rebuildar containers backend, IA e frontend conforme arquivos alterados; atualizar stack local e conferir `/health` e logs sem segredos.
6. Inspecionar a UI em desktop e viewport estreito: estados de documentos, progresso, falha/retry, busca, filtros, resultados, links e ausência de resultados. Registrar capturas QA sem dados pessoais.
7. Fazer revisão de acessibilidade básica: labels, foco/teclado, mensagens de erro/status, contraste e botões desabilitados/enabled.
8. Revisar todas as rotas tocadas contra OpenAPI; validar 400/401/403/404/409/413 e comportamento de projeto arquivado, conforme aplicável.
9. Ler cada diff e conferir dependências/compatibilidade; excluir alterações S2-03/04/05/08 não necessárias às quatro tarefas.
10. Confirmar que nenhum artefato `tmp/`, cookie/token, arquivo de banco, segredo ou documento QA não curado está staged.

**Atualização 03/10/2026:** serviço Python 60/60; integração PostgreSQL de documentos 17/17 e de busca 1/1; backend sem DB 290 aprovados/0 falhas/19 ignorados; frontend 206/206 + build; backend typecheck/build; auditoria backend sem vulnerabilidades; configuração Docker e `git diff --check` aprovados. O banco QA já não existe no PostgreSQL. Continua bloqueado o aceite de relevância S2-06/S2-17: Q008 permanece perdida e a equipe ainda não definiu metas formais; baseline final deve ser produzido depois da decisão de produto. A falha da suíte ampla em S2-03/04 segue separada e sem resolução.

**Atualização complementar 03/10/2026:** o harness S2-17 foi endurecido para aceitar somente API local, registrar SHA/hash do snapshot de código/dataset/corpus e expor ranking por consulta; suíte Python completa 62/62. Baseline autenticado reexecutado no candidato em base descartável: 26/26 consultas, zero vazamentos, mas p95 2.261 ms e 0/26 abaixo de 2 s. Diagnóstico: Q008 é a paráfrase “PDI” → “plano de desenvolvimento individual” que some sob `0.55`; Q022 confunde menção genérica a gráficos no projeto solicitado com evidência de saldo de crédito que só existe em outro projeto. A execução mediu o gate de latência e falhou; é necessário investigar inferência/ambiente sem alterar o limite silenciosamente. O resultado e a proveniência estão em [avaliação PRE-06 v2](QA_SEARCH_V2_2026-10-02.md).

## 10. Fase 6 — Empacotar um único PR

### Preparação

1. Primeiro concluir o inventário e separar o escopo. Só então integrar a `main` remota atualizada; como o working tree está misturado e sem commits, não fazer rebase/reset/merge às cegas. Preservar uma cópia recuperável antes de qualquer operação que possa conflitar e resolver conflitos mantendo a origem de cada alteração.
2. Separar o conteúdo por commits lógicos dentro do mesmo branch/PR, mantendo um único PR:
   - commit/parte A: S2-01 + S2-02 (pipeline, extração, testes e documentação de ingestão);
   - commit/parte B: S2-06 (busca, filtros, UI de resultado necessária, migrations e testes);
   - commit/parte C: S2-17 (dataset final, runner, métricas, relatório e comandos QA).
3. Mudanças compartilhadas entram no commit cuja responsabilidade principal as exige; a descrição do PR registra dependências e arquivos multi-task.
4. Incluir S2-03/04/05/08 só quando a Fase 0 demonstrar dependência técnica indispensável. Caso contrário, preservá-las localmente para PR próprio, sem descartá-las.
5. Revisar o diff staged commit a commit, e depois o diff combinado final. Conferir estatísticas para detectar arquivo indevido, gerado ou temporário.

### Descrição e gates

1. Escrever descrição única do PR com resumo, tabela S2-01/02/06/17, dependência formal de S2-17, decisões de corpus, migrations, variáveis de ambiente, resultados de testes e limitações de qualidade.
2. Publicar relatório QA sanitizado e linkar dataset/documentação; nunca anexar cookie/resultados brutos com conteúdo sensível.
3. Abrir PR contra `main` somente após todos os gates locais estarem verdes e solicitar revisão independente.
4. Esperar CI no SHA exato do PR; corrigir comentários bloqueadores e executar novamente testes afetados.
5. Após aprovação, informar quais tarefas estão tecnicamente prontas e quais podem ser concluídas no Trello de acordo com o DoD do time. O merge permanece separado da autorização para encerrar os cartões.

## 11. Ordem total e estimativa de esforço

| Fase | Saída | Esforço aproximado |
|---|---|---:|
| 0. Inventário e escopo | Mapa de paths/dependências; escopo do PR | 0,5 dia |
| 1. S2-01 | Falha/retry/restart/concurrency verificados | 0,5–1 dia |
| 2. S2-02 | Smoke automatizado quatro formatos até remoção | 1–2 dias |
| 3. S2-06 | Corpus ampliado, Q008/Q022 diagnosticados e ranking revalidado | 2–3 dias |
| 4. S2-17 | Harness final e relatório na build candidata | 1–2 dias |
| 5. Regressão integrada/UX | Todas as suites, Docker, rotas e UI | 1–2 dias |
| 6. PR único | Diff limpo, commits lógicos, CI e review | 0,5–1 dia + espera de review |

As estimativas são planejamento inicial, não promessa de calendário. S2-17 pode ser desenvolvido em paralelo durante as fases 1–3, mas sua **execução de aceite** fica depois da estabilização de S2-01/02/06.

## 12. Lista de verificação para declarar pronto ao envio

- [ ] Dependências formais mantidas: avaliação S2-17 executada sobre S2-01, S2-02 e S2-06 integradas.
- [ ] Fase 0 identificou e excluiu mudanças fora das quatro tasks, sem apagar alterações locais.
- [ ] S2-01 passou integração de estados, failure/retry, leases, restart e concorrência.
- [ ] S2-02 passou smoke repetível de processamento PDF, DOCX, MD e TXT; ciclo completo de busca/remoção foi validado em fixture representativa (idealmente os quatro formatos).
- [ ] S2-06 passou filtros, IDs, busca de conteúdo, isolamento, query negativa, rota/link e latência.
- [ ] S2-17 executou dataset/corpus versionados no SHA candidato, sem segredos, com relatório por categoria.
- [ ] Q008/Q022 e qualquer outro FP/FN estão corrigidos ou explicitamente limitados no relatório; nenhuma regressão escondida pelo gabarito.
- [ ] Suites backend/Python/frontend, typecheck, builds, migrations, segurança e health passaram.
- [ ] Inspeção UX/rotas/API documentada; nenhuma tela de fluxo principal ficou sem estado de loading/empty/error.
- [ ] Diff staged não inclui temporários ou tasks alheias; commits têm separação lógica sob o mesmo PR.
- [ ] PR único criado contra main, CI verde no SHA final e revisão por par solicitada.
