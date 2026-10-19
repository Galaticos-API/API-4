# Teste do pipeline de ingestão (S2-01 + S2-02 + observabilidade local)

Guia prático atualizado após o PR de limpeza da stack Docker (`(fix) docker e build de verificacao`).
O n8n foi **removido definitivamente** da stack. O pipeline roda 100% via worker interno
do backend + ai-service.

## Arquitetura em três linhas

1. **Upload** no frontend grava o documento com `status_processamento = 'pendente'`.
2. **Worker** no backend (`startDocumentsBackgroundWorker` em `index.ts`)
   roda a cada ciclo: reivindica o próximo pendente com lease, chama
   `POST ai-service:8000/documents/process` (header `X-Document-Ingestion-Token`),
   recebe os chunks com embeddings de 1024d e persiste em `chunk` dentro da
   mesma transação que marca o documento como `processado`. Falhas são
   capturadas em `processamento_erro` + `processamento_tentativas`.
3. **Tela `/admin/ingestion`** (admin) mostra em tempo real a fila:
   contagens por estado, documentos ativos, falhas recentes, com pipeline
   visual (Recebido → Processando → Indexado) e botão de "Reprocessar"
   para itens em falha. Faz polling a cada 5 s.

---

## Modo nativo (sem Docker Desktop / sem WSL2)

Se a máquina não tem WSL2 (Docker Desktop no Windows Home exige WSL2, não
tem alternativa via Hyper-V), dá pra rodar o pipeline inteiro nativo. Testado
e validado ponta a ponta. Resumo das pegadinhas encontradas:

### O que instalar

```powershell
winget install --id Ollama.Ollama --source winget
winget install --id Python.Python.3.11 --source winget
winget install --id PostgreSQL.PostgreSQL.16 --source winget
```

Node já precisa estar instalado (qualquer LTS recente). Depois:

```bash
cd backend && npm install
cd ../frontend && npm install
cd ../ai-service && python -m venv .venv && ./.venv/Scripts/pip install -r requirements.txt
```

### Senha do Postgres (instalador silencioso via winget)

O instalador EDB via `winget --silent` usa `postgres` como senha do
superusuário sem perguntar. Crie o role/banco do projeto:

```bash
psql -h localhost -U postgres -d postgres -c "CREATE ROLE sinapse LOGIN PASSWORD 'sinapse_dev_password' SUPERUSER;"
psql -h localhost -U postgres -d postgres -c "CREATE DATABASE sinapse OWNER sinapse;"
```

### Sem pgvector (bloqueio real, sem solução nativa simples)

PostgreSQL nativo no Windows **não tem pacote de pgvector**. A extensão só
vem pronta na imagem Docker `pgvector/pgvector:pg16`, ou compilando do zero
com Visual Studio Build Tools. Isso afeta duas coisas:

1. **`CREATE EXTENSION vector`** falha nas migrations — use o script
   `backend/scripts/apply-native-no-vector.mjs`, que aplica `init.sql` +
   todas as migrations com um *shim* (remove a extensão, troca
   `vector(1024)` por `real[]`, remove índices HNSW):

   ```bash
   cd backend && node scripts/apply-native-no-vector.mjs
   ```

2. **O INSERT de chunks usa `$N::vector`** (em `documents.repository.ts` e
   `chunks.service.ts`). Esse cast falha porque o tipo `vector` não existe
   de verdade. Para persistir chunks localmente, troque temporariamente
   `::vector` → `::real[]` e o literal `[a,b,c]` → `{a,b,c}` nesse INSERT.
   **Nunca commite essa troca** — no Docker do time, com pgvector de
   verdade, o código correto é `::vector`. É puramente uma muleta local.

   Consequência: a busca híbrida (`/api/v1/search`) não funciona nesse modo
   (o `embedding <=> $3::vector` também precisa do tipo real) — ela dá erro
   mesmo com o shim de persistência. Tudo o resto (upload, worker, extração,
   chunking, embeddings reais, observabilidade) funciona normalmente.

### `.env` para modo nativo

Use `localhost` em vez dos nomes de serviço do Docker (`backend`, `ai-service`) e
confirme que `DOCUMENT_INGESTION_TOKEN` bate entre backend e ai-service:

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
AI_SERVICE_URL=http://localhost:8000
OLLAMA_BASE_URL=http://localhost:11434
DOCUMENT_STORAGE_DIR=storage/documents
DOCUMENT_INGEST_WEBHOOK_URL=
AI_SERVICE_TOKEN=sinapse-dev-ai-service-token
DOCUMENT_INGESTION_TOKEN=sinapse-dev-document-ingestion-token-2026
```

### Ollama: nunca rode duas instâncias

O instalador do Ollama registra um app de bandeja que já sobe `ollama serve`
sozinho. Se você também rodar `ollama serve` manualmente, as duas brigam
pela porta 11434 — uma delas vence o bind, mas o processo de inferência por
trás pode ficar instável e derrubar a conexão no meio de uma chamada de
embedding (erro `wsarecv: conexão forçada a cancelar pelo host remoto`).
Confira antes de subir:

```powershell
Get-Process -Name "ollama*"
```

Se houver mais de um `ollama.exe`/`ollama app.exe`, mate todos e suba só um:

```powershell
Get-Process -Name "ollama*" | Stop-Process -Force
```
```bash
OLLAMA_KEEP_ALIVE=24h ollama serve
```

### Subindo os três serviços

```bash
cd backend && npm run dev          # porta 3001
cd ai-service && ./.venv/Scripts/python -m uvicorn main:app --port 8000
cd frontend && npm run dev         # porta 5173
```

### Criando o primeiro admin

Cadastro público só cria `dev` — criar `po`/`admin` exige já estar
autenticado como admin, de propósito. Use o script oficial (idempotente,
reaproveita o `hashPassword` real do backend, então o login funciona de
primeira):

```bash
cd backend && npm run bootstrap:admin
```

Cria (ou promove, se já existir) o admin de teste padrão:

- **E-mail:** `admin@sinapse.local`
- **Senha:** `Admin@123`

Para outro e-mail/senha: `npx tsx scripts/bootstrap-admin.mts --email=... --password=... --nome="..."`.
Rodar de novo é seguro — se a conta já existir só garante `role='admin'`
sem mexer na senha (a menos que passe `--force-password`).

---

## 0. Pré-requisitos (modo Docker)

- Docker Desktop rodando.
- Ollama **no host** (fora do Docker) com o modelo `bge-m3`:

  ```bash
  ollama pull bge-m3
  ollama list
  ```

- `.env` na raiz. **Em dev basta `cp .env.example .env`** — todos os valores
  já estão preenchidos com defaults seguros para desenvolvimento local:

  ```env
  AI_SERVICE_TOKEN=sinapse-dev-ai-service-token
  DOCUMENT_INGESTION_TOKEN=sinapse-dev-document-ingestion-token-2026
  ```

  Nenhuma geração de token manual é necessária para subir localmente.

---

## 1. Subir a stack

```bash
cp .env.example .env          # apenas na primeira vez
docker compose up -d --build
docker compose ps
```

Sanity-check:

```bash
curl http://localhost:3001/health   # backend
curl http://localhost:8000/health   # ai-service (ollama: "connected")
```

> **Nota:** o ai-service e o Ollama só sobem com o profile `local-ai`:
> ```bash
> docker compose --profile local-ai up -d --build
> ```

## 2. Criar o primeiro admin

```bash
docker exec sinapse-backend npm run bootstrap:admin
```

- **E-mail:** `admin@sinapse.local`
- **Senha:** `Admin@123`

## 3. Testar via UI (fluxo oficial)

1. Entre no frontend (`http://localhost:5173`), logue como `admin` ou `po`.
2. Abra um projeto ativo e vá na aba **Documentos**.
3. Envie um PDF, DOCX, MD ou TXT (até 20 MB).
4. A linha do documento aparece com badge `Aguardando ingestão` (worker ainda
   não pegou) ou `Processando` (worker começou). A tabela auto-atualiza
   enquanto houver documento em andamento.
5. Quando terminar, o badge vira `Disponível no acervo` (verde).
6. Se der falha, aparece o motivo no card e um botão **Reprocessar** que
   recoloca o documento como `pendente`.

### Acompanhar em tempo real (`/admin/ingestion`)

Em outra aba, logado como `admin`:

**→ http://localhost:5173/admin/ingestion** (ou menu **Admin → Pipeline de ingestão**).

- A tela mostra 4 contadores (`Pendente`, `Processando`, `Processado`, `Falha`),
  a lista de documentos **em andamento** com barra de progresso animada,
  e uma seção de **falhas recentes** com botão de reprocessar.
- Polling a cada 5 s. O timestamp "Atualizado em" confirma o refresh.

## 4. Confirmar no banco (opcional)

```bash
docker exec -it sinapse-postgres psql -U sinapse -d sinapse <<'SQL'
SELECT id, nome, status_processamento, processamento_tentativas,
       processamento_erro, updated_at
  FROM documento
 ORDER BY updated_at DESC
 LIMIT 10;

SELECT entidade_id, LEFT(texto, 60) AS preview, vector_dims(embedding) AS dim
  FROM chunk
 WHERE entidade_tipo = 'documento'
 ORDER BY created_at DESC
 LIMIT 10;
SQL
```

Critérios:
- `status_processamento = 'processado'` no último documento enviado
- `vector_dims(embedding) = 1024` (bge-m3) nos chunks correspondentes

## 5. Buscar no acervo (S2-06, busca híbrida)

Via UI: **Conhecimento → busca** (precisa escolher o projeto e digitar 3+ caracteres).

Via `curl`:

```bash
# Logue para pegar o cookie de sessão
curl -i -c cookies.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sinapse.local","password":"Admin@123"}'

# Busca híbrida (vetor + full-text)
curl -b cookies.txt "http://localhost:3001/api/v1/search?q=arquitetura&projeto_id=<uuid>"
```

## 6. Troubleshooting

| Sintoma | Causa provável | Correção |
|---|---|---|
| `docker compose up` falha com `Configure AI_SERVICE_TOKEN in .env` | `.env` não existe | `cp .env.example .env` — todos os tokens já estão preenchidos |
| Login retorna `200` mas toda requisição seguinte dá `401` (**erro de verificação de sessão**) | **Bug histórico já corrigido:** `NODE_ENV=production` no Docker fazia o cookie de sessão ser definido com `secure=true`, que browsers recusam em HTTP. A flag `COOKIE_INSECURE_DEV=true` no `docker-compose.yml` corrige isso. | `git pull && docker compose up -d --build` |
| Documento fica preso em `pendente` | Worker não está rodando ou crashou na primeira tentativa | `docker logs sinapse-backend \| grep -i document`; reinicie o container |
| Status muda para `falha` com `processamento_erro: "A autenticação interna da ingestão não está configurada."` | `DOCUMENT_INGESTION_TOKEN` diferente entre backend e ai-service | Ambos usam o mesmo default do `.env.example`; confirme com `docker exec sinapse-backend env \| grep DOCUMENT_INGESTION_TOKEN` |
| Status `falha` com `invalid embedding dimension` | Ollama rodando com modelo diferente de `bge-m3` | `ollama pull bge-m3`; checar `OLLAMA_EMBEDDING_MODEL` |
| Status `falha` com `503 service unavailable` | ai-service não está no ar ou Ollama caiu | `docker logs sinapse-ai-service` / `curl http://localhost:11434` |
| `/admin/ingestion` dá 403 | Logado como PO/dev, não admin | `docker exec sinapse-backend npm run bootstrap:admin` |
| UI "Reprocessar" responde mas documento não sai da fila | Worker reivindicou e falhou de novo | Olhe `processamento_erro` na próxima atualização; se for `503`, aguarde Ollama responder |
| Erro de embedding some sozinho na próxima tentativa, ou Ollama trava/derruba conexão no meio da chamada | Duas instâncias de `ollama serve` rodando ao mesmo tempo (comum no Windows: o app de bandeja já sobe uma) | `Get-Process -Name "ollama*"`; mate todas e suba uma única com `OLLAMA_KEEP_ALIVE=24h ollama serve` |

## 7. Avaliação da busca (S2-17)

```bash
docker exec sinapse-ai-service python -m evaluation.run_search_suite \
  --dataset evaluation/datasets/search-ptbr-v2.json
```

Relatório sai em stdout com Top-K accuracy, taxa de falso-positivo e
latência média. Datasets em `ai-service/evaluation/datasets/`.
