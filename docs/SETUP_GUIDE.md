# Setup e desenvolvimento local

Este guia cobre dois caminhos: subir o produto em containers ou executar backend e frontend no host usando PostgreSQL do Docker. Para entender serviços e limites de responsabilidade, consulte [Arquitetura](Architecture/README.md); para endpoints, consulte o [OpenAPI](api/openapi.yaml).

## Requisitos

### Execução com Docker

- Docker Desktop com Docker Compose v2.
- Git para clonar o repositório.

### Desenvolvimento no host

- Node.js 20 ou superior e npm.
- Python 3.11 ou superior para o serviço de IA.
- Google Chrome ou Chromium para a suíte E2E.
- Docker disponível para PostgreSQL + pgvector.

## Opção A — Aplicação completa com Docker Compose

```bash
git clone https://github.com/Galaticos-API/API-4.git
cd API-4
cp .env.example .env
docker compose up --build -d
docker compose ps
```

No PowerShell, substitua `cp .env.example .env` por `Copy-Item .env.example .env`.

O Compose padrão inicia PostgreSQL, n8n, backend e frontend. O backend aplica migrations pendentes antes de aceitar tráfego. URLs padrão:

- Frontend: <http://localhost:5173>
- Saúde do backend: <http://localhost:3001/health>
- Swagger UI: <http://localhost:3001/docs>
- n8n: <http://localhost:5678>

O primeiro acesso à aplicação começa pela tela de autenticação. Cadastre uma conta para usar o ambiente local. Os dados enviados permanecem nos volumes Docker até serem removidos explicitamente.

### Habilitar IA local (opcional)

O Ollama roda diretamente no host, fora do Docker. Essa configuração evita a camada adicional de virtualização do runtime de modelos e permite que ele use melhor os recursos de CPU/GPU disponíveis na máquina.

Instale o Ollama pelo [site oficial](https://ollama.com/download) e confirme que o comando está disponível:

```bash
ollama --version
ollama serve
```

Em outro terminal, baixe os modelos usados pelo projeto:

```bash
ollama pull bge-m3
ollama pull qwen2.5:1.5b
```

Com o Ollama em execução no host, inicie o serviço Python pelo perfil `local-ai`:

```bash
docker compose --profile local-ai up --build -d
```

O `ai-service` containerizado acessa o Ollama por `http://host.docker.internal:11434` (ou pelo valor de `OLLAMA_DOCKER_BASE_URL`). Para executar o serviço Python no próprio host, use `OLLAMA_BASE_URL=http://localhost:11434`. Os modelos são baixados separadamente e ocupam espaço significativo. Valide a integração no fluxo desejado; o app possui comportamento de fallback quando o assistente está indisponível.

## Opção B — Frontend/backend no host

Use esta opção quando precisar de hot reload. Execute os comandos a partir da raiz do repositório.

### 1. Configure as variáveis locais

```bash
cp .env.example .env
docker compose up -d postgres
```

Se também precisar das integrações locais, inicie `n8n` ou o perfil `local-ai` separadamente. Os containers acessam PostgreSQL pelo hostname `postgres` na porta `5432`; processos no host usam `localhost` e a porta publicada `POSTGRES_PORT` (padrão `55432`). O Ollama permanece no host e deve estar iniciado antes do `ai-service`.

### 2. Instale dependências e aplique as migrations

```bash
npm ci --prefix backend
npm ci --prefix frontend
npm --prefix backend run migrate
```

O comando usa `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST` e `POSTGRES_PORT` de `.env`. Aponte-o somente para um banco local apropriado. Migrations pendentes são aplicadas em ordem e registradas em `_schema_migrations`.

### 3. Inicie os serviços em terminais separados

Terminal 1 — backend:

```bash
cd backend
npm run dev
```

Terminal 2 — frontend:

```bash
cd frontend
npm run dev
```

URLs locais padrão: frontend <http://localhost:5173>, API <http://localhost:3001>, Swagger <http://localhost:3001/docs>. O Vite encaminha `/api` e `/health` para `http://localhost:3001` por padrão. Para outro endereço, defina `VITE_API_PROXY_TARGET` no ambiente do processo Vite.

### 4. Serviço Python (opcional)

```bash
python -m venv .venv
# Linux/macOS
source .venv/bin/activate
# PowerShell
.venv\Scripts\Activate.ps1
python -m pip install -r ai-service/requirements.txt
```

Com Ollama acessível e configurado, inicie o serviço dentro de `ai-service`:

```bash
python main.py
```

O serviço lê sua configuração a partir de `ai-service/config.py`. O serviço de IA e o backend são processos distintos: endereços `localhost` funcionam entre processos no host, enquanto containers devem usar os nomes DNS da rede Docker.

## Variáveis importantes

| Variável | Padrão de desenvolvimento | Uso |
|---|---|---|
| `POSTGRES_USER` | `sinapse` | Usuário do banco. |
| `POSTGRES_PASSWORD` | `sinapse_dev_password` | Senha local do banco; troque fora de uma máquina isolada. |
| `POSTGRES_DB` | `sinapse` | Banco usado pelo backend e pelos containers. |
| `POSTGRES_PORT` | `55432` | Porta publicada no host; containers usam `5432`. |
| `BACKEND_PORT` | `3001` | Porta publicada da API. |
| `FRONTEND_PORT` | `5173` | Porta publicada da SPA. |
| `N8N_PORT` | `5678` | Porta publicada do n8n. |
| `DOCUMENT_MAX_SIZE_MB` | `20` | Tamanho máximo de upload aceito pela API. |
| `DOCUMENT_EVENTS_WEBHOOK_URL` | vazio | Destino HTTP dos eventos de remoção de documento. Sem consumidor configurado, o evento permanece pendente e é tentado novamente. |
| `OLLAMA_PORT` | `11434` | Porta do Ollama executado no host. |
| `OLLAMA_DOCKER_BASE_URL` | `http://host.docker.internal:11434` | URL do Ollama vista pelo `ai-service` dentro do Docker. |
| `OLLAMA_LLM_MODEL` | `qwen2.5:1.5b` | Modelo de geração local. |
| `OLLAMA_EMBEDDING_MODEL` | `bge-m3` | Modelo de embedding local. |

Consulte `.env.example` para a lista completa. `N8N_ENCRYPTION_KEY` tem um valor compartilhado para facilitar desenvolvimento: substitua por segredo forte e privado em qualquer ambiente exposto. Não coloque tokens de API no Git.

## Testes e build

```bash
# Backend
npm ci --prefix backend
npm --prefix backend run build
npm --prefix backend run typecheck
npm --prefix backend test

# Frontend
npm ci --prefix frontend
npm --prefix frontend test
npm --prefix frontend run build

# Serviço Python
python -m pip install -r ai-service/requirements.txt
python -m py_compile ai-service/main.py ai-service/config.py ai-service/services/chunker.py ai-service/services/ollama_client.py
python -m unittest discover -s ai-service/tests -v

# Browser E2E: backend + PostgreSQL + frontend + Chrome devem estar disponíveis
npm ci --prefix e2e
npm --prefix e2e test
```

Os testes unitários de backend funcionam sem banco. Os casos de integração habilitados por `ARCHIVE_TEST_DATABASE_URL`, `BACKLOG_TREE_TEST_DATABASE_URL` e `SEED_TEST_DATABASE_URL` precisam de PostgreSQL descartável com migrations aplicadas. Os scripts `test:integration:s1` e `test:integration:s105` também exigem as URLs de banco dedicadas indicadas no próprio script e no guia de migrations.

Para validar o acervo curado, execute dentro de `backend` `npm run build`, `npm run seed:validate` e `npm run test:seed`. O modo que grava dados, `seed:apply`, exige `SEED_DATABASE_URL` apontando para banco dedicado terminado em `_dev` ou `_test`; leia [o guia do seed](../database/seed/README.md) antes de usar.

## Dados, volumes e limpeza

```bash
docker compose down
```

O comando para containers e preserva os volumes nomeados. Para apagar os dados persistidos do ambiente local:

```bash
docker compose down -v
```

O segundo comando é destrutivo para o banco, documentos, n8n e modelos guardados nesses volumes. Não o execute se precisar preservar esses dados. Não use a base de desenvolvimento compartilhada para testes E2E que criam e removem registros.

## Diagnóstico rápido

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f postgres
docker compose config --quiet
```

- **Porta ocupada:** altere `POSTGRES_PORT`, `BACKEND_PORT`, `FRONTEND_PORT` ou `N8N_PORT` em `.env`, sem mudar as portas internas dos containers.
- **API sem saúde:** confira logs do backend e do Postgres; confirme usuário, senha, nome e porta definidos em `.env`.
- **Alteração de schema não aparece:** confira `_schema_migrations` e os logs do backend. Criar novamente um container não reaplica `init.sql` num volume já existente; crie uma migration versionada.
- **Upload falha:** verifique o healthcheck `/health`, espaço no volume de documentos e o limite configurado em `DOCUMENT_MAX_SIZE_MB`.
- **Busca ou chat sem trechos:** a busca depende de conteúdo/chunks disponíveis e isolados por projeto; um arquivo armazenado não implica, por si só, que foi extraído e indexado.
- **IA indisponível:** confirme que o Ollama está em execução no host, teste `ollama list`, verifique o download dos modelos e confirme `OLLAMA_BASE_URL`. Para o `ai-service` em Docker, o endereço padrão é `http://host.docker.internal:11434`.

## Documentos relacionados

- [Arquitetura e estado da implementação](Architecture/README.md)
- [OpenAPI](api/openapi.yaml)
- [Migrations](../database/migrations/README.md)
- [Seed e política de dados](../database/seed/README.md)
- [Índice de toda a documentação](README.md)
