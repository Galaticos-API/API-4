# Estado da implementação e revisão QA — 02/10/2026

> **Atualização de escopo e evidência:** a branch foi sincronizada com `origin/main` em `4dc3033`. Este documento contém snapshots anteriores; para o estado operacional atual e decisões de inclusão no PR, seguir [plano canônico de fechamento](PLANO_FECHAMENTO_PR_UNICO_S2.md). A rodada integrada mais recente teve 347 testes aprovados e 1 falha fora do escopo S2-01/02/06/17, em `knowledge-indexer.db.test.ts` (S2-03/04). Portanto, não declarar a suíte integrada completa como verde nem S2-03/04 como aprovadas com base nas linhas históricas abaixo.

> **Adendo posterior da S2-01/02/06:** integrações PostgreSQL executadas isoladamente nesta continuação passaram: documentos 16/16 e busca 1/1. O smoke autenticado de ciclo completo foi implementado e passou no teste de API simulada para PDF/DOCX/MD/TXT; ainda não foi executado contra o backend/IA/Ollama reais. Python 59/59, backend sem DB 290 aprovados/19 ignorados, frontend 206/206 + build, backend typecheck/build e auditoria 0 vulnerabilidades passaram. A qualidade de relevância continua pendente.

> **Adendo QA de 03/10/2026 (evidência mais recente):** o smoke autenticado real passou com PDF, DOCX, MD e TXT: upload, processamento, busca com origem e remoção. Integrações PostgreSQL isoladas: documentos 17/17 (inclui falha→retry manual→conclusão, sem chunks parciais/duplicados) e busca 1/1. Serviço Python 60/60; backend sem DB 290 aprovados, 0 falhas e 19 ignorados; frontend 206/206 e build; backend typecheck/build; `npm audit --omit=dev` sem vulnerabilidades; Docker Compose config e `git diff --check` aprovados. O banco temporário já não consta no PostgreSQL. Esses resultados não resolvem o aceite de relevância S2-06/S2-17: Q008 continua perdida com `0.55`, a métrica de abstenção no corpus pequeno ainda não atende consenso formal e o baseline final ainda precisa ser executado após a decisão PO/time. A falha histórica de S2-03/04 permanece fora de escopo e sem resolução.

> **Complemento QA S2-17, 03/10/2026:** runner fechado tecnicamente com bloqueio de URLs remotas para proteger o cookie, SHA do commit + indicador de working tree + fingerprint do código/dataset/corpus, e resultados avaliados com ranking por consulta. Python 62/62. O cookie QA antigo responde 401 no backend atual, então a bateria autenticada ainda não foi repetida com o runner novo; análise e próximos gates estão em [QA_SEARCH_V2_2026-10-02.md](QA_SEARCH_V2_2026-10-02.md). S2-17 continua implementada, mas a execução final do baseline segue pendente.

> **Errata, mesmo dia:** o baseline foi repetido com novo banco/projeto/usuário descartáveis e runner novo. A bateria de 26 consultas autenticadas terminou com Recall@5 95%, acurácia sem evidência 83,3%, p50/p95 2.129/2.261 ms, 0/26 dentro de 2 s e zero violações de projeto. Portanto a execução já não está pendente; seu gate de latência falhou e Q008/Q022 seguem abertas. Proveniência e diagnóstico detalhados no relatório PRE-06 v2.

Este registro separa **implementação no checkout local**, **validação técnica** e **conclusão formal no Scrum**. As alterações revisadas ainda não foram commitadas nem enviadas à `main`; portanto, não contam como tarefas formalmente concluídas no quadro.

Complemento da revisão e evidências executadas em 02/10: [relatório final QA](RELATORIO_FINAL_QA_S2_2026-10-02.md).

## Resultado executivo

- A Sprint 1 permanece concluída em 27/09/2026.
- O início planejado da Sprint 2 é 05/10/2026. O trabalho abaixo é preparação implementada localmente antes da data planejada, não encerramento da Sprint 2.
- HEAD local e `origin/main` estavam no mesmo commit (`8c9d04a`) no início desta revisão. As alterações listadas estão no working tree.
- Os fluxos de ingestão, indexação, expurgo e UI de busca têm implementação local e testes relevantes. O usuário aprovou manter os dois modos de busca: por identificador e por conteúdo. Foi criada PRE-06 v2 com IDs isolados e metadados rastreáveis; a fixture v1 permanece intacta. A nova avaliação melhorou recuperação, mas abstenção segue reprovada.
- O Trello e o PR não foram atualizados por esta revisão. Checklist no código não substitui revisão por pares, CI no commit final ou aceite PO.

## Acompanhamento por entrega

| IDs | Entrega | Implementação local | Evidência técnica | Pendência para aceite |
|---|---|:---:|---|---|
| S2-01 / S2-02 | Ingestão em segundo plano, extração PDF/DOCX/MD/TXT, chunking, embeddings, estados e retry | Implementada, aceite pendente | Integração PostgreSQL de documentos passou 17/17; smoke real upload→processamento→busca/origem→remoção passou para PDF, DOCX, MD e TXT | Revisão por pares, CI no SHA final e aceite formal |
| S2-03 / S2-04 | Indexação de itens concluídos/decisões, idempotência e retirada de arquivados/reabertos | Inconclusiva | Execução integrada mais recente falhou em `knowledge-indexer.db.test.ts`; há evidência histórica conflitante, que não deve ser tratada como aprovação | Diagnosticar e validar em trabalho próprio; fora do PR S2-01/02/06/17 salvo dependência provada |
| S2-05 | Expurgo administrativo do contexto do projeto | ✅ | Rota/repositório/UI e testes; suites e build passaram | Revisar o fluxo autenticado com confirmação em navegador; aceite formal |
| S2-06 / S2-07 | Busca híbrida, filtros e isolamento por projeto | ⚠️ melhoria local em revisão; ❌ aceite de qualidade | `0.55` escolhido provisoriamente: Recall@5 95%, ausência 83,3%, 0 vazamentos; perde Q008 | Ampliar corpus negativo, acordar metas finais e reavaliar |
| S2-08 | Interface dos resultados e navegação para fonte | ✅ | Contrato alinhado à API; 3 testes de UI e suite frontend passaram | Revisão visual autenticada e aceite formal |
| S2-17 | Bateria de consultas, avaliador e métricas | ⚠️ harness endurecido; avaliação v2 executada; ainda não aprovada | 26 consultas via API/PostgreSQL/pgvector/Ollama; baseline experimental 0.30: Recall@5 100%, p95 137 ms, 0 violações; 16,7% ausência; matriz até 0.60; padrão local agora 0.55 provisório | Aumentar negativos e acordar metas formais com PO/time |
| S2-09 a S2-16, S2-18 a S2-21 | Governança/copiloto, dependências, versões, DoR/DoD e integração completa | ⬜ | Não fazem parte das alterações auditadas neste checkout | Continuam no planejamento e precisam de implementação/revisão próprias |

## Resultado da avaliação ponta a ponta da busca

Corpus PRE-06 de seis chunks e 24 consultas, via API local autenticada, Ollama e PostgreSQL descartável. Métricas de uma execução, não SLA universal:

| Configuração | Recall@5 | Acurácia sem evidência | p50 / p95 | Isolamento |
|---|---:|---:|---:|---:|
| Corte vetorial inicial `0.3` (execução 02/10) | 88,9% | 16,7% (1/6) | 130 / 145 ms | 0 violações |
| Experimento `0.6` (execução anterior) | 72,2% | 100% (6/6) | 138 / 207 ms | 0 violações |
| PRE-06 v2, regra de identificador exato + conteúdo | 100% | 16,7% (1/6) | 114 / 137 ms | 0 violações |
| PRE-06 v2, corte vetorial `0.55` exploratório | 95% | 83,3% (5/6) | p95 136 ms | 0 violações |
| PRE-06 v2, corte vetorial `0.60` exploratório | 85% | 100% (6/6) | p95 131 ms | 0 violações |

Todas ficaram abaixo do limite de latência de 2.000 ms nesse ambiente pequeno. O usuário aprovou manter localizadores exatos e consultas por conteúdo; a v2 preserva os 24 casos v1 e acrescenta dois casos por conteúdo. O corte `0.55` foi escolhido provisoriamente como padrão local: na v2, deixa um falso positivo entre seis consultas sem evidência e perde uma consulta positiva (Q008). A qualidade ainda não tem aceite formal do PO/time e requer corpus ampliado. Detalhes em [avaliação S2-17 v2](QA_SEARCH_V2_2026-10-02.md).

## Verificações executadas

- Backend: 290 testes aprovados, zero falhas; 19 ignorados no comando geral por dependerem de ambiente. As integrações relevantes foram executadas separadamente abaixo.
- Typecheck backend: aprovado.
- Integração PostgreSQL S2-01/documentos: 16/16; S2-06/busca: 1/1. A execução ampla mais recente falhou no indexador S2-03/S2-04; não registrar sua integração como aprovada até reproduzir e resolver a falha.
- Frontend: 206 testes aprovados; build de produção aprovado.
- Serviço Python: 60 testes aprovados após cobertura do smoke de ciclo de vida e validação local-only do destino autenticado.
- Auditoria de dependências backend: zero vulnerabilidades reportadas.
- Imagens Docker de backend/frontend recompiladas; backend `/health` saudável e rota SPA `/admin` respondeu HTTP 200.
- `git diff --check`: sem erros de whitespace (avisos de conversão LF/CRLF no Windows).
- E2E S2-02: arquivos PDF, DOCX, Markdown e TXT enviados pela API terminaram como `processado`, foram localizados na busca com origem do documento e removidos com sucesso; a consulta seguinte confirmou que a fonte removida não permanecia nos resultados. Texto de célula DOCX também foi verificado no PostgreSQL depois da reconstrução do container de IA com a correção.
- S2-17: 24/24 consultas pela API autenticada local, PostgreSQL/pgvector e Ollama; p50/p95 130/145 ms, Recall@5 88,9%, MRR@5 88,9%, precisão macro@5 17,8%, acurácia sem evidência 16,7%, 24/24 dentro de 2 s e zero violações de isolamento.
- Ambiente de validação isolado (`sinapse_s2qa_20261002_test`); fixture e usuário de QA foram criados apenas nele. Resultados detalhados não incluem cookie nem dados pessoais.
- O banco descartável da revisão foi removido. Artefatos locais do smoke E2E permanecem porque a política automática bloqueou a remoção de arquivos do storage; eles não foram incluídos em commits.
- O avaliador S2-17 falha diante de fonte fora do projeto; a busca S2-06 dá precedência à correspondência literal para identificadores e não usa fallback semântico nesses casos, sem diferenciar maiúsculas/minúsculas. A PRE-06 v2 aprovada pelo usuário foi criada e avaliada: 26 consultas, Recall@5 100%, Precision@5 20%, MRR@5 100%, acurácia sem evidência 16,7%, p50/p95 114/137 ms, 0/26 violações. A matriz exploratória encontrou melhor ponto observado em 0.55 (Recall 95%, ausência 83,3%, Q008 perdido). Banco de QA removido. O relatório mantém a ressalva de que o working tree não estava commitado no SHA listado.
- A regressão frontend encontrou e corrigiu reset de visualização que podia sobrescrever o clique ao alternar Leitura/Markdown quando a análise selecionada muda; suíte final 206/206 e build de produção aprovados.
- Auditoria de dependências backend: zero vulnerabilidades.
- Inspeção visual autenticada das telas de busca/admin: pendente. Só foi possível conferir a tela pública de login; a conta temporária criada para QA foi removida ao final.
- Regressão adicional em banco PostgreSQL vazio: migrations 001–017 aplicadas; documentos 17/17 e busca 1/1. A suíte ampla subsequente reportou falha no indexador S2-03/04; banco descartável não consta mais no servidor PostgreSQL.
- Ciclo HTTP real em backend separado/banco descartável: upload Markdown 201 → processamento → busca 200 encontrou chunk → remoção 204 → busca seguinte sem chunk. Conta/projeto/banco temporários foram removidos ao descartar o banco.
- Container local backend reconstruído e recriado após incluir os limiares no Compose; `/health` saudável, DB conectado, runtime configurado em `0.55` vetorial e `0.05` textual.
- Métricas do harness agora são agregadas por categoria; avaliador passou a cobrir versão divergente, identificadores duplicados, consulta ausente, fonte duplicada/desconhecida e escopo de projeto.
- A inspeção visual autenticada continua pendente. A skill `computer-use` do ambiente proíbe automatizar diálogos de autenticação; foi conferida apenas a tela pública de login. Suítes de UI automatizadas passaram.

## Próximas ações

1. Preservar PRE-06 v1 e v2 e ampliar casos negativos e paráfrases com origem curada.
2. Informar ao PO/time que `0.55` está adotado provisoriamente; o corte perde Q008 e deixa 1/6 negativo com falso positivo, enquanto `0.60` zera esses falsos positivos, mas perde Q001/Q008/Q021.
3. Acordar metas de Recall/Precision/MRR e abstenção; então selecionar configuração e repetir avaliação em corpus maior.
4. Fazer revisão visual autenticada de S2-05 e S2-08 e executar o fluxo completo de documento do upload até consulta.
5. Executar regressão final, revisar diff contra a `main`, abrir/atualizar PR e só então marcar as tarefas concluídas no Trello após aceite.
