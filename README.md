# Sinapse — Base Inteligente de Requisitos

> **PRO4TECH · Fatec São José dos Campos · Grupo Galáticos**  
> *Projeto de Aprendizagem Interdisciplinar (API) — 4º Semestre (2º Semestre/2026)*

O **Sinapse** é a memória institucional da fábrica de software. A plataforma converte requisitos de software e decisões de engenharia em uma base de conhecimento inteligente e reutilizável, auxiliando Product Owners (POs) e equipes de desenvolvimento na especificação de features com menor retrabalho e maior conformidade com o padrão da fábrica.

---

## 🏗️ Arquitetura e Componentes de Infraestrutura

A stack base deste repositório compreende:

| Serviço / Componente | Descrição / Tecnologia | Função Principal |
|---|---|---|
| **postgres** | `pgvector/pgvector:pg16` | Banco de dados unificado: relacional e busca vetorial (HNSW) |
| **n8n** | `docker.n8n.io/n8nio/n8n:latest` | Orquestração do pipeline de ingestão e gatilhos de documentos |
| **ollama** | `ollama/ollama:latest` | Runtime local de IA: inferência de LLM e geração de embeddings |
| **`n8n-local-sync`** | CLI GitOps em Python ([PyPI](https://pypi.org/project/n8n-local-sync/)) | Versionamento, validação e sincronização bidirecional de workflows |
| **Python RAG / IA** *(em desenv.)* | Python 3.11+ | Chunking, embeddings e integração com LLM local |
| **Backend Aplicação** *(em desenv.)* | Node.js | API REST, regras de negócio e controle de acesso |
| **Frontend SPA** *(em desenv.)* | React | Interface do Product Owner e consulta ao acervo |

---

## 🚀 Como Iniciar o Ambiente de Desenvolvimento

### 1. Pré-requisitos
- [Docker](https://docs.docker.com/get-docker/) (v24+) e [Docker Compose](https://docs.docker.com/compose/) (v2+)
- [Python](https://www.python.org/) 3.9 ou superior (para execução do `n8n-local-sync`)
- [Git](https://git-scm.com/)

### 2. Clonar e Configurar Variáveis de Ambiente
Copie o modelo de variáveis de ambiente para criar o seu `.env`:

```bash
cp .env.example .env
```

> ⚠️ **Importante sobre o `N8N_ENCRYPTION_KEY`:**  
> A chave definida no `.env.example` (`sinapse-shared-dev-encryption-key-2026`) é compartilhada entre toda a equipe de desenvolvimento. **Não altere esta chave localmente em desenvolvimento**, pois ela garante que as credenciais e workflows exportados continuem válidos e interoperáveis entre as máquinas do time.

### 3. Subir os Containers
Inicie os containers do PostgreSQL (com pgvector), n8n e Ollama em segundo plano:

```bash
docker compose up -d
```

Verifique se os serviços estão saudáveis:

```bash
docker compose ps
```

- **PostgreSQL:** `localhost:5432` (Usuário: `sinapse`, Senha padrão: `sinapse_dev_password`, Banco: `sinapse`)
- **n8n Web UI:** [http://localhost:5678](http://localhost:5678)
- **Ollama API:** [http://localhost:11434](http://localhost:11434)

### 4. Baixar Modelos no Ollama
Os modelos são persistidos no volume Docker `sinapse_ollama_data`. Para baixar os modelos recomendados no PRD:

```bash
# Modelo de Embeddings multilíngue (recomendado)
docker compose exec ollama ollama pull bge-m3

# Modelo LLM para inferência (versão leve para desenvolvimento em CPU)
docker compose exec ollama ollama pull qwen2.5:1.5b

# Listar modelos instalados
docker compose exec ollama ollama list
```

---

## 🔄 Versionamento de Workflows com `n8n-local-sync`

Os workflows do n8n são versionados no Git através do utilitário GitOps [`n8n-local-sync`](https://pypi.org/project/n8n-local-sync/).

### 1. Instalação da CLI
Instale a ferramenta via `pip`:

```bash
pip install n8n-local-sync
```

### 2. Configurar a API Key do n8n
1. Acesse o n8n no navegador: [http://localhost:5678](http://localhost:5678).
2. Na primeira inicialização, crie a conta de proprietário local.
3. Acesse **Settings** (ícone de engrenagem) → **n8n API** → **Create an API key**.
4. Copie a chave gerada e adicione-a ao seu arquivo local `.env`:
   ```env
   N8N_API_KEY=sua_chave_aqui
   ```

> 🔒 **Atenção:** A variável `N8N_API_KEY` nunca deve ser versionada no Git. O arquivo `.env` já está incluído no `.gitignore`.

### 3. Comandos do Dia a Dia

| Operação | Comando | Descrição |
|---|---|---|
| **Validar workflows** | `n8n-sync validate` | Analisa a sintaxe JSON e varre possíveis segredos/senhas expostos |
| **Visualizar status** | `n8n-sync status` | Exibe o estado de sincronização entre o Git local e a instância do n8n |
| **Ver diferenças (diff)** | `n8n-sync diff` | Mostra alterações estruturais normalizadas (sem poluição de metadados) |
| **Puxar do n8n para o Git** | `n8n-sync sync` | Atualiza o repositório local com os workflows criados/editados no n8n |
| **Subir do Git para o n8n** | `n8n-sync push` | Envia os workflows versionados no repositório para o container do n8n |

### 4. Fluxo de Trabalho Recomendado
1. Desenvolva ou altere o workflow na interface web do n8n ([http://localhost:5678](http://localhost:5678)).
2. Traga as alterações para o repositório:
   ```bash
   n8n-sync sync
   ```
3. Valide a integridade do JSON e ausência de credenciais:
   ```bash
   n8n-sync validate
   ```
4. Revise as alterações com o `git diff` limpo:
   ```bash
   git diff n8n/workflows/
   ```
5. Comite e envie as alterações em commits semânticos:
   ```bash
   git add n8n/workflows/
   git commit -m "feat(workflow): add document parser workflow"
   git push origin <sua-branch>
   ```

---

## 🧪 Integração Contínua (CI)

A esteira automatizada no GitHub Actions (`.github/workflows/ci.yml`) é disparada a cada Push e Pull Request:
- Valida a sintaxe e a configuração do Docker Compose (`docker compose config`).
- Executa `n8n-sync validate` para assegurar que nenhum workflow com erro de estrutura ou credencial exposta chegue à branch principal.

---

## 📁 Estrutura de Pastas do Repositório

Consulte o [Guia de Configuração e Desenvolvimento](docs/SETUP_GUIDE.md) para instruções detalhadas de inicialização de cada microsserviço.

```text
API-4/
├── .github/
│   └── workflows/
│       └── ci.yml                 # Pipeline de validação no GitHub Actions
├── ai-service/                    # Microsserviço Python/FastAPI (RAG, Chunking & Ollama)
├── backend/                       # API REST Node.js/TypeScript (CRUD, Auth & Postgres)
├── docs/                          # Documentação do projeto, PRD, backlog e guias
│   ├── Architecture/              # Diagramas de arquitetura, fluxo RAG e ERD
│   └── SETUP_GUIDE.md             # Guia completo de configuração das stacks
├── frontend/                      # SPA React/TypeScript/Vite (Interface do PO)
├── n8n/
│   ├── local-files/               # Diretório compartilhado montado em /files no n8n
│   └── workflows/                 # Workflows exportados e versionados no Git
├── .env.example                   # Modelo de configuração de variáveis de ambiente
├── .gitignore                     # Arquivos e diretórios desconsiderados pelo Git
├── .n8n-sync.yaml                 # Configuração do n8n-local-sync
├── docker-compose.yml             # Orquestração dos containers (Postgres, n8n & Ollama)
├── LICENSE                        # Licença do projeto
└── README.md                      # Este arquivo
```

