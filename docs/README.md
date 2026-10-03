# Documentação do Sinapse

Este índice separa os guias operacionais, contratos e especificações de produto. O [README da raiz](../README.md) apresenta o produto e o caminho rápido para executá-lo.

## Começar e desenvolver

| Documento | Conteúdo |
|---|---|
| [Guia de setup](SETUP_GUIDE.md) | Docker Compose, execução local, variáveis, testes e solução de problemas. |
| [Testes E2E](../e2e/README.md) | Suítes de navegador, dependências e execução com dados descartáveis. |
| [Avaliação da busca (S2-17)](../ai-service/evaluation/README.md) | Dataset PT-BR versionado, gabarito PRE-06, métricas e execução do avaliador. |
| [Estado QA de 02/10/2026](STATUS_REVISAO_2026-10-02.md) | Evidências por entrega local, gates executados, pendências de aceite e plano de correção da busca. |
| [Migrations](../database/migrations/README.md) | Baseline, migrations versionadas e validação do banco. |
| [Seed](../database/seed/README.md) | Acervo curado, validação, modo de aplicação e política de segurança. |

## Produto e arquitetura

| Documento | Fonte de verdade para |
|---|---|
| [PRD PRO4TECH](PRD-PRO4TECH.md) | Problema, visão, requisitos e regras de produto. |
| [Arquitetura](Architecture/README.md) | Componentes que existem hoje, fronteiras, fluxos e propostas ainda não implementadas. |
| [Backlog](backlog/README.md) | Épicos, features e PBIs. |
| [Planejamento Scrum](PLANEJAMENTO_SCRUM.md) | Equipe, abordagem Scrum, estado concluído da Sprint 1 e sprints futuras ainda planejadas. |
| Interface e handoff | Consulte o [backlog](backlog/README.md) e os [materiais de design](../figma-import/README.md); o documento de handoff S1-28 não está versionado nesta branch. |
| [Protótipo e Design System](../figma-import/README.md) | Telas, protótipo navegável e materiais de handoff. |

## Contratos e integrações

- [OpenAPI do backend](api/openapi.yaml): endpoints, autenticação, payloads e respostas.
- [Compatibilidade de rotas legadas](api/epics-compat.yaml): rotas mantidas para clientes antigos.
- [Integração de remoção de documentos](integrations/n8n-document-removed.example.json): exemplo do evento enviado ao n8n.
- [Documento de integração](DOCUMENTOS_INTEGRACAO.md): fluxos entre serviços e convenções de integração.

## QA e registros históricos

Os planos de correção por PR abaixo guardam evidências e decisões da época. Não são o status atual das PRs; use o [registro QA de 02/10/2026](STATUS_REVISAO_2026-10-02.md) para o checkout atual.

- [Matriz de cenários S1-23](qa/S1-23-matriz-cenarios.md)
- [Roteiro de review S1-23](qa/S1-23-roteiro-review.md)
- [Consolidação S1-05](../database/migrations/README.md#consolidação-s1-05)
- [Correções do PR #34](PR34_CORRECTION_PLAN.md)
- [Correções do PR #36](PR36_CORRECTION_PLAN.md)
- [Conflitos S1-05](../database/migrations/README.md#consolidação-s1-05)

## Como manter os documentos

- Atualize este índice e o README quando um guia de referência mudar de local ou escopo.
- Trate o código, as migrations e o OpenAPI como fontes do comportamento implementado.
- Identifique no texto quando algo é requisito do PRD, decisão histórica, proposta futura ou comportamento já implementado.
- Não publique credenciais, tokens, dados pessoais, documentos de clientes ou `.env`.
- Ao adicionar imagens de produto, use capturas reais do app, texto alternativo descritivo e dados sintéticos. Explique o contexto da captura.
