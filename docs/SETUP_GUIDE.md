# Guia de Configuração e Desenvolvimento — Sinapse

> **PRO4TECH · Fatec São José dos Campos · Grupo Galáticos**  
> *Base Inteligente de Requisitos — Memória da Fábrica de Software*

Este documento descreve como configurar, executar e validar as stacks principais do projeto **Sinapse** em ambiente de desenvolvimento local, em conformidade com as diretrizes do [PRD](file:///c:/Users/danip/Documents/.Projetos/API-4/docs/PRD/PRD.md) e [AGENTS.md](file:///c:/Users/danip/Documents/.Projetos/API-4/docs/AGENTS.md).

---

## 🏛️ Topologia e Portas Padrão

| Serviço / Componente | Stack / Tecnologia | Diretório / Container | Porta Local | Função Principal |
|---|---|---|---|---|
| **PostgreSQL + pgvector** | `pgvector:pg16` | Container `sinapse-postgres` | `5432` | Banco unificado: dados relacionais e vetores HNSW |
| **n8n** | `n8nio/n8n:latest` | Container `sinapse-n8n` | `5678` | Orquestração de pipeline, watch em `/files` e gatilhos |
| **Ollama** | `ollama/ollama:latest` | Container `sinapse-ollama` | `11434` | Runtime local de IA: inferência de LLM e embeddings |
| **Backend** | Node.js 20+ / TS / Express | `backend/` | `3001` | API REST, CRUD, Auth, validações determinísticas |
| **Frontend** | React 19 / TS / Vite | `frontend/` | `5173` | SPA do Product Owner (requisitos, acervo, chat) |
| **Serviço de IA** | Python 3.11+ / FastAPI | `ai-service/` | `8000` | Chunking unificado, RAG, harness e ponte com Ollama |

---

## 📋 1. Pré-requisitos do Sistema

Certifique-se de ter instalado em sua máquina de desenvolvimento:
- [Docker](https://docs.docker.com/get-docker/) (v24+) e [Docker Compose](https://docs.docker.com/compose/) (v2+)
- [Node.js](https://nodejs.org/) (v20 ou superior) e `npm` (v10+)
- [Python](https://www.python.org/) (3.11 ou superior) e `pip`
- [Git](https://git-scm.com/)

---

## 🚀 2. Inicialização da Infraestrutura Base (Docker)

### 2.1. Clonar e Configurar Variáveis de Ambiente
Copie o modelo de ambiente na raiz do repositório:

```bash
cp .env.example .env
```

> ⚠️ **Atenção:** Mantenha a chave `N8N_ENCRYPTION_KEY` idêntica à do modelo para garantir que credenciais e workflows permaneçam interoperáveis entre todas as máquinas da equipe.

### 2.2. Subir os Containers
Inicie o banco de dados, o orquestrador e o runtime de IA em segundo plano:

```bash
docker compose up -d
```

Verifique se todos os containers estão saudáveis:

```bash
docker compose ps
```

Endpoints ativos:
- PostgreSQL: `localhost:5432`
- n8n Web: [http://localhost:5678](http://localhost:5678)
- Ollama API: [http://localhost:11434](http://localhost:11434)

### 2.3. Baixar os Modelos no Ollama
Os modelos baixados são persistidos no volume Docker `sinapse_ollama_data`:

```bash
# Modelo de Embeddings multilíngue (recomendado no PRD)
docker compose exec ollama ollama pull bge-m3

# Modelo LLM para inferência (versão leve para CPU em desenvolvimento)
docker compose exec ollama ollama pull qwen2.5:1.5b

# Listar modelos instalados
docker compose exec ollama ollama list
```

---

## ⚙️ 3. Configuração das Stacks de Aplicação

### 3.1. Backend (`backend/`)

1. Acesse o diretório do backend:
   ```bash
   cd backend
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Inicie o servidor em modo de desenvolvimento (hot-reload):
   ```bash
   npm run dev
   ```
4. Verifique o healthcheck:
   - Endpoint: [http://localhost:3001/health](http://localhost:3001/health)
   - Resposta esperada: `{"status":"healthy", "dependencies":{"database":"connected"}}`

---

### 3.2. Frontend (`frontend/`)

1. Acesse o diretório do frontend:
   ```bash
   cd frontend
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Inicie o servidor de desenvolvimento do Vite:
   ```bash
   npm run dev
   ```
4. Acesse no navegador:
   - URL: [http://localhost:5173](http://localhost:5173)

---

### 3.3. Serviço de IA em Python (`ai-service/`)

1. Acesse o diretório do serviço:
   ```bash
   cd ai-service
   ```
2. Crie e ative um ambiente virtual (recomendado):
   ```bash
   python -m venv venv
   # No Windows (PowerShell):
   .\venv\Scripts\Activate.ps1
   # No Linux/Mac:
   source venv/bin/activate
   ```
3. Instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```
4. Inicie o servidor FastAPI:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```
5. Documentação Swagger interativa:
   - Acesse: [http://localhost:8000/docs](http://localhost:8000/docs)
   - Healthcheck: [http://localhost:8000/health](http://localhost:8000/health)

---

## 🔄 4. Versionamento de Workflows n8n (`n8n-local-sync`)

Os workflows do n8n são sincronizados bidirecionalmente com o repositório Git via CLI:

```bash
# Validar estrutura e segredos dos workflows
n8n-sync validate

# Checar diferenças entre Git e a instância local
n8n-sync status
n8n-sync diff

# Puxar alterações do n8n para o repositório
n8n-sync sync

# Subir alterações do Git para o container do n8n
n8n-sync push
```

---

## 🔒 5. Princípios e Fronteiras da Arquitetura (PRD 10.2)

1. **Persistência Segura (RNF-01):**
   O serviço de IA **nunca** escreve diretamente nas tabelas relacionais de negócio. Ele emite sugestões tipadas e o Backend Node.js persiste apenas após validação determinística e aprovação do Product Owner.
2. **Fonte Única de Chunking (PRD 10.3):**
   O n8n orquestra a chegada de arquivos em `/files` e notifica o microsserviço Python via `POST /ingest`. O Python é a **única fonte da verdade** para regras de chunking e cálculo de embeddings vetoriais.
3. **Isolamento por Projeto:**
   A separação de dados entre projetos no RAG é garantida por **filtros de metadados obrigatórios** (`project_id`), nunca por proximidade vetorial isolada.

---

## 🧪 6. Comandos de Validação e Qualidade

| Verificação | Comando |
|---|---|
| **Sintaxe Docker Compose** | `docker compose config --quiet` |
| **Validação de Workflows** | `n8n-sync validate` |
| **Tipagem do Backend** | `cd backend && npm run typecheck` |
| **Build do Frontend** | `cd frontend && npm run build` |
| **Sintaxe do Serviço de IA** | `python -m py_compile ai-service/main.py` |
