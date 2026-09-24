# Sinapse — Base Inteligente de Requisitos

> **PRO4TECH · Fatec São José dos Campos · Grupo Galáticos**  
> *Projeto de Aprendizagem Interdisciplinar (API) — 4º Semestre (2º Semestre/2026)*

O **Sinapse** é a memória institucional da fábrica de software. A plataforma converte itens de backlog, regras de negócio e decisões de arquitetura em uma base de conhecimento inteligente, auxiliando Product Owners (POs) e equipes de desenvolvimento na especificação padronizada de features, redução de retrabalho e reúso de conhecimento prévio.

---

## 📚 Documentação Canônica do Projeto

Toda a especificação técnica, backlog e decisões arquiteturais estão estruturados nos documentos oficiais abaixo:

| Documento | Descrição e Conteúdo |
|---|---|
| 🤖 **[Contexto Canônico de IA e Agentes](docs/AGENTS.md)** | **Contexto unificado para LLM Agents** com visão do produto, schema, regras de negócio e stack. |
| 📄 **[PRD — Product Requirements Document](docs/PRD-PRO4TECH.md)** | Requisitos funcionais (RF), não-funcionais (RNF), regras de negócio e governança de IA. |
| 🏛️ **[Arquitetura, GraphRAG e Embeddings](docs/Architecture/README.md)** | Diagramas, fluxo RAG, ERD, proposta GraphRAG e benchmark do spike `bge-m3`. |
| 📊 **[Planejamento Scrum & Plano de Tarefas](docs/PLANEJAMENTO_SCRUM.md)** | Metas executivas por sprint e detalhamento operacional das 71 tarefas técnicas. |
| 📋 **[Backlog de Produto (66 PBIs)](docs/backlog/README.md)** | Especificação completa dos 6 épicos e 18 features no padrão da fábrica. |
| 🔌 **[Contrato OpenAPI (Serviços)](docs/api/openapi.yaml)** | Especificação dos endpoints e schemas HTTP compartilhados entre backend, IA e n8n. |

---

## 🏗️ Arquitetura e Componentes de Infraestrutura

O ecossistema é distribuído em microsserviços conteinerizados e locais:

| Componente | Tecnologia | Porta Local | Responsabilidade Principal |
|---|---|:---:|---|
| **Banco Unificado** | PostgreSQL 16 + `pgvector` | `55432` (host) | Dados relacionais de negócio e vetores de chunks indexados por HNSW (`vector_cosine_ops`). |
| **Orquestrador** | n8n (`latest`) | `5678` | Pipeline assíncrono de ingestão, gatilhos de arquivos em `/files` e integrações. |
| **Runtime de IA** | Ollama | `11434` | Inferência local de LLM (`qwen2.5:1.5b`) e geração de embeddings (`bge-m3`). |
| **Backend** | Node.js 20+ / Express / TS | `3001` | Autenticação JWT, CRUD, validações determinísticas (RF-08 a RF-11) e **única escrita no banco de negócio**. |
| **Frontend** | React 19 / Vite / TS | `5173` | SPA para Product Owners (gestão hierárquica de PBIs, acervo e chat fundamentado). |
| **Serviço de IA** | Python 3.11+ / FastAPI | `8000` | Chunking unificado, cálculo de vetores, Harness PRO4TECH e montagem de contexto RAG. |

### Qualidade e completude de PBIs

O backend calcula o indicador de completude a partir das regras determinísticas ativas para PBIs (título, história, cenários, termos vagos e protótipo); ele não depende do valor em cache da coluna de score. No cadastro do PBI, o PO informa explicitamente se ele exige interface/protótipo. A verificação de protótipo só entra no cálculo quando esse campo está ativo e consulta a tabela `prototipo`. A política atual é persistida no PostgreSQL e pode ser consultada ou alterada por administradores em `GET /api/v1/quality/configuration/pbi` e `PUT /api/v1/quality/configuration/pbi`. As alterações são versionadas e auditadas. As migrations correspondentes são `008_quality_organization_configuration.sql` e `009_pbi_interface_quality.sql`; veja o [guia de migrations](database/migrations/README.md) e o [contrato OpenAPI](docs/api/openapi.yaml).

---

## 🚀 Inicialização Rápida

### 1. Pré-requisitos
- [Docker](https://docs.docker.com/get-docker/) (v24+) e [Docker Compose](https://docs.docker.com/compose/) (v2+)
- [Node.js](https://nodejs.org/) (v20+) e [Python](https://www.python.org/) (3.11+)
- [Git](https://git-scm.com/)

### 2. Configurar Variáveis de Ambiente
```bash
cp .env.example .env
```
> ⚠️ **Importante:** Mantenha `N8N_ENCRYPTION_KEY=sinapse-shared-dev-encryption-key-2026` em ambiente de desenvolvimento local para compatibilidade com os workflows versionados.

### 3. Subir a Infraestrutura Base
```bash
docker compose up -d
```
Serviços disponíveis:
- PostgreSQL: `localhost:55432` (Usuário: `sinapse`, Senha padrão: `sinapse_dev_password`, Banco: `sinapse`)
- n8n Web: [http://localhost:5678](http://localhost:5678)
- Backend: [http://localhost:3001/health](http://localhost:3001/health)
- Frontend: [http://localhost:5173](http://localhost:5173)

Para encerrar os serviços sem apagar os dados persistidos:
```bash
docker compose down
```

Para remover o container e todos seus dados:
```bash
docker compose down -v
```

### 4. Baixar Modelos Locais no Ollama (opcional)
```bash
docker compose --profile local-ai up -d

# Modelo de Embeddings PT-BR (validado no Spike PRE-07)
docker compose --profile local-ai exec ollama ollama pull bge-m3

# Modelo LLM para inferência rápida local (CPU)
docker compose --profile local-ai exec ollama ollama pull qwen2.5:1.5b
```

---

## 🔄 Versionamento de Workflows (`n8n-local-sync`)

Os workflows do n8n são versionados no Git via utilitário GitOps [`n8n-local-sync`](https://pypi.org/project/n8n-local-sync/):

```bash
# Instalação
pip install n8n-local-sync

# Principais comandos
n8n-sync status     # Visualiza estado de sincronização local vs n8n
n8n-sync diff       # Compara diferenças estruturais limpas
n8n-sync sync       # Puxa workflows do container para o Git (n8n/workflows/)
n8n-sync push       # Envia workflows do Git para a instância do n8n
n8n-sync validate   # Valida integridade do JSON e detecta segredos expostos
```

---

## 🧪 Comandos de Validação e Qualidade

| Verificação | Comando | Descrição |
|---|---|---|
| **Validação Docker** | `docker compose config --quiet` | Checa a sintaxe do Compose |
| **Workflows n8n** | `n8n-sync validate` | Varre sintaxe e credenciais expostas |
| **Migrations** | `cd backend && npm run migrate` | Executa migrations pendentes no Postgres |
| **Testes Backend** | `cd backend && npm test` | Executa suíte de testes unitários/integração |
| **Validação integrada S1** | `cd backend && npm run test:integration:s1` | Valida os fluxos HTTP com PostgreSQL real da Sprint 1 |
| **Auditoria de Segurança** | `cd backend && npm run audit:security` | Verifica dependências de produção |
| **Tipagem Backend** | `cd backend && npm run typecheck` | Checagem estrita de tipos TypeScript |
| **Testes Frontend** | `cd frontend && npm test` | Executa a suíte Vitest da interface |
| **Build Frontend** | `cd frontend && npm run build` | Valida bundle de produção da SPA |
| **Testes do serviço de IA** | `cd ai-service && python -m unittest discover -s tests` | Executa os testes do chunker e metadados |

---

## 📁 Estrutura de Diretórios

```text
API-4/
├── .github/workflows/         # Pipelines de CI/CD no GitHub Actions
├── ai-service/                # Microsserviço Python/FastAPI (RAG, Chunking & Ollama)
├── backend/                   # API REST Node.js/TypeScript (CRUD, Auth & Postgres)
├── database/                  # DDL de inicialização, migrations e seeds
│   ├── init.sql               # Schema DDL inicial
│   ├── migrations/            # Migrations versionadas em SQL
│   └── seed/                  # Carga de dados fictícios para desenvolvimento
├── docs/                      # Documentação canônica consolidada
│   ├── AGENTS.md              # Contexto canônico autoritativo para agentes e LLMs
│   ├── PRD-PRO4TECH.md        # Especificação técnica e requisitos funcionais
│   ├── PLANEJAMENTO_SCRUM.md  # Organização das tarefas de desenvolvimento e plano técnico
│   ├── Architecture/          # Diagramas de arquitetura, fluxo RAG, ERD e GraphRAG
│   ├── backlog/               # Mapeamento dos 6 épicos e 66 PBIs
│   └── api/                   # Contrato OpenAPI (openapi.yaml)
├── frontend/                  # SPA React 19/TypeScript/Vite (Interface do PO)
├── n8n/                       # Workflows exportados e arquivos locais monitorados
├── scripts/                   # Utilitários e benchmarks (spike_embeddings.py)
├── .env.example               # Template de variáveis de ambiente
├── .n8n-sync.yaml             # Configuração do n8n-local-sync
└── docker-compose.yml         # Orquestração local (PostgreSQL + pgvector, n8n & Ollama)
```
