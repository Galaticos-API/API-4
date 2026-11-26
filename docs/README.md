# Documentação do Sinapse

Este índice consolida os guias operacionais, contratos técnicos, especificações de produto e relatórios de qualidade do **Sinapse**. Para uma visão geral de apresentação e instruções rápidas de execução, consulte o [README principal da raiz](../README.md).

---

## 🚀 Começar e Desenvolver

| Documento | Conteúdo |
|---|---|
| [Guia de Setup](SETUP_GUIDE.md) | Configuração com Docker Compose, execução local/híbrida, variáveis de ambiente, comandos de teste e troubleshooting. |
| [Ambiente Local com IA](AMBIENTE-LOCAL.md) | Guia dedicado para execução do Ollama no host (`bge-m3` e `qwen2.5:1.5b`), configurações e diagnóstico de desempenho. |
| [Testes E2E](../e2e/README.md) | Suíte de testes de navegador de ponta a ponta (`playwright-core` e `axe-core`) com dados descartáveis. |
| [Avaliação da Busca (S2-17)](../ai-service/evaluation/README.md) | Baterias de teste em português versionadas, gabarito PRE-06, métricas e execução do avaliador. |
| [Migrations de Banco](../database/migrations/README.md) | Baseline, migrações versionadas (001 a 031), validação de integridade e locks concorrentes. |
| [Seed de Dados](../database/seed/README.md) | Acervo curado de demonstração, validação, modo de aplicação e [política de dados e privacidade](../database/seed/POLITICA_DE_DADOS.md). |

---

## 📐 Produto e Arquitetura

| Documento | Conteúdo |
|---|---|
| [PRD — PRO4TECH](PRD-PRO4TECH.md) | Documento de Requisitos do Produto: contexto, dores do cliente, visão, requisitos funcionais e não funcionais. |
| [Arquitetura do Sistema](Architecture/README.md) | Componentes do sistema, decisões de design, fronteiras de serviço, diagramas C4 e propostas evolutivas (GraphRAG). |
| [Backlog do Produto](backlog/README.md) | Índice geral do backlog com especificações detalhadas por épico: [EP-01](backlog/EP-01-especificar-backlog.md), [EP-02](backlog/EP-02-preservar-conhecimento.md), [EP-03](backlog/EP-03-apoio-inteligencia-artificial.md), [EP-04](backlog/EP-04-consultar-conhecimento.md), [EP-05](backlog/EP-05-competencias-equipe.md) e [EP-06](backlog/EP-06-acesso-controlado.md). |
| [Planejamento Scrum](PLANEJAMENTO_SCRUM.md) | Equipe, papéis, organização das três sprints, critérios de pronto e rastreabilidade dos 66 PBIs. |
| [Protótipo e Design System](../figma-import/README.md) | Wireframes, tokens de cores, tipografia, heurísticas de usabilidade e protótipo interativo. |
| [Notas de Kick-off](Kick-off/Kick-off.md) | Registro do alinhamento inicial com os stakeholders da PRO4TECH. |

---

## 🔌 Contratos, APIs e Integrações

| Documento | Conteúdo |
|---|---|
| [OpenAPI do Backend](api/openapi.yaml) | Especificação completa da API REST (OpenAPI 3.0), endpoints, autenticação via sessão, esquemas e respostas. |
| [Compatibilidade de Rotas Legadas](api/epics-compat.yaml) | Contrato de rotas mantidas para clientes e integrações legadas. |
| [Upload de Documentos](DOCUMENT_UPLOAD.md) | Guia completo sobre upload, arquitetura do pipeline assíncrono, endpoints e tratamento de erros. |
| [Pipeline de Ingestão](../IMPLEMENTACAO_PIPELINE_INGESTAO.md) | Especificação técnica do worker de ingestão e geração de embeddings vetoriais. |
| [Documentos e Convenções de Integração](DOCUMENTOS_INTEGRACAO.md) | Fluxos entre microsserviços, tokens de serviço e convenções de comunicação interna. |
| [Workflows n8n](../n8n/README.md) | Configuração dos fluxos versionados via `n8n-local-sync` e consumidores de eventos. |

---

## 🤖 Especificações de IA e RAG

| Documento | Conteúdo |
|---|---|
| [Mecanismo de Busca Híbrida (S2-08)](S2-08-BUSCA.md) | Fusão RRF de busca vetorial (HNSW cosseno) e Full-Text Search em português. |
| [Harness de IA Versionado (S2-09)](S2-09-HARNESS.md) | Governança de prompts, limites de espera, schemas JSON e administração de modos de IA. |
| [Copiloto Assistivo (S2-10)](S2-10-COPILOTO.md) | Modos de questionamento, padronização, geração de BDD e sugestão de itens similares. |
| [RAG com Evidências Verificadas (S2-24)](S2-24-rag-evidencias.md) | Citação obrigatória de passagens literais, recusa explícita sem evidências e isolamento por projeto. |

---

## 🧪 Qualidade, Homologação e Registros de QA

| Documento | Conteúdo |
|---|---|
| [Validação de RNFs (S3-16)](qa/S3-16-validacao-rnfs.md) | Relatório de validação de requisitos não funcionais: desempenho, latência de chat, segurança/LGPD e acessibilidade. |
| [Release Final & Roteiro Demo (S3-17)](qa/S3-17-release-final.md) | Evidências da suíte de 1.437 testes aprovados, seed reproduzível, backup/restore e roteiro da apresentação final. |
| [Matriz de Cenários S1-23](qa/S1-23-matriz-cenarios.md) | Matriz de cenários de homologação e testes manuais da Sprint 1. |
| [Roteiro de Review S1-23](qa/S1-23-roteiro-review.md) | Roteiro passo a passo executado na revisão com o cliente. |
| [Status de Revisão QA](STATUS_REVISAO_2026-10-02.md) | Histórico de fechamento de gates e critérios de aceite. |

---

## 📌 Como manter a documentação

- Mantenha este índice e o README principal sincronizados sempre que novos guias forem criados ou movidos.
- Trate o código, as migrations e o arquivo `openapi.yaml` como fontes de verdade do comportamento implementado.
- Diferencie explicitamente requisitos já implementados de propostas futuras (como GraphRAG) ou registros históricos.
- **Atenção:** Jamais versione dados sensíveis, credenciais reais, `.env` ou documentos com informações de clientes.
