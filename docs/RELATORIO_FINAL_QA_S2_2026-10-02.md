# Relatório de fechamento da rodada QA — Sprint 2

> **Errata da revisão posterior:** `origin/main` agora está em `4dc3033`. A suíte backend com PostgreSQL habilitado executada depois deste relatório teve 347 aprovações e 1 falha em `knowledge-indexer.db.test.ts` (S2-03/04). As afirmações abaixo de que a integração do indexador passou 1/1 e de que a regressão ampla estava verde são históricas e foram contraditas pela execução mais recente; não usar este relatório como prova de aprovação de S2-03/04. O ciclo completo upload→busca→remoção foi comprovado com Markdown; PDF/DOCX/TXT têm evidência anterior de processamento e geração de chunks, não do ciclo completo.

> **Adendo de continuidade — 03/10/2026:** após o relatório inicial, foram acrescentados testes de fixture PDF/DOCX/MD/TXT e um smoke autenticado real de ciclo completo. A execução real passou para os quatro formatos (upload → processamento → busca com origem → remoção → fonte ausente). A integração de documentos passou de 16/16 para 17/17, incluindo falha seguida de retry sem chunks parciais ou duplicados. Resultado atual: Python 60/60; backend sem DB 290 aprovados, 0 falhas, 19 ignorados; integração PostgreSQL documentos 17/17 e busca 1/1; frontend 206/206 e build; backend typecheck/build; `npm audit --omit=dev` sem vulnerabilidades; Docker Compose config e `git diff --check` aprovados. O banco QA não consta mais no PostgreSQL. Permanecem pendentes critérios de relevância aceitos pelo PO/time e novo baseline final S2-17; Q008 ainda se perde com o corte provisório `0.55`. A falha histórica de S2-03/04 não foi corrigida por esta rodada. O smoke foi executado em backend Docker temporário ligado ao banco de QA, sem expor cookie ou dados pessoais.

**Data:** 02/10/2026 (America/Sao_Paulo)
**Escopo:** S2-01, S2-02, S2-03/04, S2-06 e S2-17
**Base:** `8c9d04a` (`origin/main` estava nesse SHA no início da revisão), com implementação e ajustes ainda locais e sem commit.

## Resumo executivo

Foram revalidados backend, serviço IA, frontend, migrations e operações reais de ingestão, busca e remoção em um banco PostgreSQL criado apenas para QA. O padrão local de similaridade vetorial foi fixado provisoriamente em `0.55` e propagado para a configuração do Docker Compose. O backend foi reconstruído e recriado; `/health` confirmou o serviço saudável e a configuração em execução retornou `0.55` / `0.05`.

As correções e verificações não equivalem a aceite formal de Sprint. A qualidade de recuperação continua limitada pelo corpus pequeno; a revisão visual autenticada completa, revisão por pares, CI/PR e aceite Scrum continuam fora desta rodada.

## Adendo da continuação — fechamento das dependências S2-17 (03/10/2026)

- Implementado `scripts/smoke_document_lifecycle.py`: smoke autenticado com fixtures sintéticas PDF/DOCX/MD/TXT, prazo limitado do worker, validação de projeto e link de origem, busca, remoção e limpeza em erro. O harness recusa URLs não locais para impedir envio do cookie de sessão a outro host e exige `--confirm-disposable`.
- O ciclo real contra backend temporário em Docker, serviço IA, Ollama e banco descartável passou nos quatro formatos: upload → `processado` → busca encontrou a fonte/projeto/rota corretos → DELETE 204 → fonte ausente. O banco e o container temporários foram removidos ao final.
- Integrações PostgreSQL finais: documentos 17/17, incluindo falha simulada da IA → retry manual → conclusão sem chunk parcial/duplicado; S2-06 busca 1/1. Suite Python 60/60; backend 290 aprovados, 0 falhas e 19 ignorados por dependência de ambiente; backend typecheck/build; frontend 206/206 e build; auditoria backend 0 vulnerabilidades.
- O smoke contra backend host foi bloqueado pela política automática; o mesmo fluxo foi validado em container Docker temporário e confinado ao banco `_test`.
- As métricas de relevância e a baseline final S2-17 ainda precisam ser reavaliadas. Q008/Q022 seguem como regressões do corpus pequeno; `0.55` continua provisório, sem metas de produto aprovadas.

## Alterações realizadas

- Backend: `SEARCH_MIN_VECTOR_SIMILARITY` agora tem padrão `0.55`; teste de configuração verifica esse padrão.
- Docker Compose: encaminha `SEARCH_MIN_VECTOR_SIMILARITY` e `SEARCH_MIN_TEXT_RANK` ao backend, com valores padrão `0.55` e `0.05`.
- Harness S2-17: adiciona métricas por categoria (Recall@k, acurácia sem evidência e latência p50/p95) e testes adversariais para identificadores duplicados, consultas ausentes, fontes duplicadas/desconhecidas, projetos incorretos e versões incompatíveis.
- Documentação: matriz e métricas por categoria atualizadas; números históricos são identificados como baseline `0.30`, separando-os da escolha local posterior `0.55`.

## Evidência de integração PostgreSQL

Foi criado o banco descartável `sinapse_s2qa_full_test`, aplicado o conjunto completo de migrations `001`–`017` em banco vazio e executados:

| Integração | Resultado |
|---|---:|
| Repositório de documentos, auditoria, outbox, leases, concorrência e remoção | 16/16 |
| Busca híbrida, escopo de projeto, localizador, tecnologia e nível | 1/1 |
| Indexação, idempotência e expurgo ao arquivar/reabrir | Resultado histórico 1/1; execução integrada mais recente falhou em `knowledge-indexer.db.test.ts` |

O banco de integração foi removido. Um segundo banco descartável foi usado no teste de ciclo completo abaixo e também removido após a execução.

## Teste real de ciclo documental

Com backend isolado na porta `3002`, banco QA próprio e o serviço IA local:

1. Cadastro temporário de PO e criação de projeto de teste: HTTP `201`.
2. Upload de Markdown: HTTP `201`.
3. Worker concluiu a ingestão e gravou chunks com embeddings locais: estado `processado`.
4. Consulta autenticada por frase exclusiva encontrou a fonte do documento: HTTP `200`.
5. Remoção do documento: HTTP `204`.
6. Nova consulta não retornou mais a fonte removida.

O banco e backend temporários foram encerrados/removidos. O backend Compose foi reconstruído e está saudável na porta `3001`. A evidência anterior registrada em `STATUS_REVISAO_2026-10-02.md` cobre ingestão de PDF, DOCX, MD e TXT; este novo ciclo até busca e remoção foi executado com Markdown.

## Regressões e qualidade

| Área | Resultado |
|---|---|
| Backend | 290 aprovados, 0 falhas, 19 ignorados por dependerem de ambiente |
| Backend typecheck / build | Aprovados |
| Integração real de busca S2-06 | 1/1 aprovado em banco descartável |
| Serviço IA | 57 testes aprovados |
| Frontend | 206 testes aprovados; build de produção aprovado |
| Dependências backend | `npm audit --omit=dev`: 0 vulnerabilidades |
| Docker Compose | Configuração renderizada com os limiares esperados; imagem backend construída e container atualizado |
| Saúde runtime | `/health`: saudável, banco conectado; backend carregou `0.55` vetorial e `0.05` textual |
| Diff whitespace | `git diff --check` aprovado; Git emitiu somente avisos de conversão LF/CRLF no Windows |

## Avaliação de relevância no corpus PRE-06 v2

O resultado principal a `0.30` foi executado antes da escolha do novo padrão. A matriz armazenada contém 26 consultas e seis chunks curados. Recalcular o relatório por categoria não reexecutou as consultas; agregou os resultados autenticados já coletados.

No corte provisório `0.55`: Recall@5 `95%`, acurácia sem evidência `83,3%` (5/6), p95 `136 ms`, zero violações de isolamento. Identificadores exatos e busca por conteúdo ficaram com 100% de Recall; paráfrases semânticas, 87,5% (7/8). A busca continua retornando um falso positivo (Q022) e perde a evidência pertinente de Q008. O corpus pequeno não permite concluir que o mesmo equilíbrio se manterá em repositórios reais.

O corte foi escolhido pelo usuário como provisório. Não existe ainda critério de produto validado para dizer que esse equilíbrio conclui S2-06/S2-17.

## Inspeção visual

A tela pública de login foi aberta em viewport desktop: campos de e-mail/senha e botão “Entrar” estão identificados no accessibility tree, e a tela renderizou sem falha visual evidente. Os testes de componentes cobrem documentos, busca e administração.

A inspeção **autenticada** das áreas de documentos, filtros, resultados, origem e ausência de resultados não foi executada no navegador: a skill `computer-use` disponível neste ambiente proíbe automatizar diálogos de autenticação. Isso não bloqueou testes por API com a conta temporária QA nem as suítes de UI automatizadas, mas deixa a revisão visual autenticada pendente.

## Pendências técnicas e de processo

1. Ampliar corpus e consultas negativas/paráfrases com curadoria rastreável; Q022 e Q008 permanecem casos de regressão.
2. Tornar repetível em CI o smoke completo dos quatro formatos (upload → processamento → busca → origem → remoção). Nesta rodada o ciclo completo foi confirmado com Markdown; o histórico anterior cobre os quatro formatos no processamento.
3. Revisão visual autenticada das telas de conhecimento/documentos e filtros/results, quando houver fluxo de revisão visual autorizado sem automação proibida de login.
4. Revisão por par, CI no SHA final, PR e aceite do Trello continuam necessários antes de declarar tarefas concluídas.
5. O working tree contém alterações preexistentes de várias tarefas e artefatos locais sob `tmp/`; não devem entrar em commit sem revisão e filtragem. Uma tentativa anterior de remover alguns artefatos foi bloqueada por revisão automática; não houve nova tentativa de contornar esse bloqueio.

## Conclusão QA

As regressões técnicas e o ciclo principal de ingestão/busca/remoção passaram no ambiente local isolado. O backend atualizado está saudável com os limiares escolhidos. S2-01/02 têm evidências fortes de implementação e ingestão; S2-06/S2-17 continuam em correção de relevância devido ao falso positivo e à evidência perdida. Nenhuma tarefa foi marcada formalmente como concluída, e não houve commit, push ou PR nesta rodada.
