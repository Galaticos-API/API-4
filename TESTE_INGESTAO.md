# Teste do pipeline de ingestão (S2-01 + S2-02 + observabilidade local)

Guia prático pós-merge do PR #44 (`codex/s2-17-ptbr-search-evaluation`). O
pipeline agora roda **sem** n8n no caminho oficial — o worker da S2-01
puxa os documentos pendentes, chama o ai-service direto e persiste os
chunks. A observabilidade visual (que antes dependia do editor do n8n)
foi reconstruída dentro da própria aplicação, em `/admin/ingestion`.

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

O workflow do n8n continua disponível como **ferramenta opcional de debug
manual** — tudo que se precisa pra validar fluxo normal já está na UI.

## 0. Pré-requisitos

- Docker Desktop rodando.
- Ollama **no host** (fora do Docker, conforme AGENTS.md) com o modelo
  `bge-m3`:

  ```bash
  ollama pull bge-m3
  ollama list
  ```

- `.env` na raiz. Em dev basta `cp .env.example .env`. O compose exige
  três variáveis preenchidas (há defaults no `.env.example`):

  ```env
  AI_SERVICE_TOKEN=sinapse-dev-ai-service-token   # backend <-> ai-service
  DOCUMENT_INGESTION_TOKEN=…minimum 32 chars…     # worker -> ai-service /documents/process
  N8N_INGEST_TOKEN=sinapse-dev-ingest-token       # opcional, só para debug via n8n
  ```

  Gere um `DOCUMENT_INGESTION_TOKEN` real com:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

## 1. Subir a stack

```bash
docker compose up -d --build
docker compose ps
```

Sanity-check:

```bash
curl http://localhost:3001/health   # backend
curl http://localhost:8000/health   # ai-service (ollama: "connected")
```

## 2. Testar via UI (fluxo oficial)

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

- **Admin → Pipeline de ingestão** (ou direto `http://localhost:5173/admin/ingestion`).
- A tela mostra 4 contadores (`Pendente`, `Processando`, `Processado`, `Falha`),
  a lista de documentos **em andamento** com barra de progresso animada,
  e uma seção de **falhas recentes** com botão de reprocessar.
- Polling a cada 5 s. O timestamp "Atualizado em" confirma o refresh.

Isso substitui integralmente o editor do n8n para debug.

## 3. Confirmar no banco (opcional)

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

## 4. Buscar no acervo (S2-06, busca híbrida)

Via UI: **Conhecimento → busca** (precisa escolher o projeto e digitar 3+ caracteres).

Via `curl`:

```bash
# Logue para pegar o cookie de sessão
curl -i -c cookies.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<senha>"}'

# Busca híbrida (vetor + full-text)
curl -b cookies.txt "http://localhost:3001/api/v1/search?q=arquitetura&projeto_id=<uuid>"
```

## 5. Debug avançado com o workflow do n8n (opcional)

O workflow `tJ7nYESUptHVmGCN-sinapse-rag-ingestão-chat-de-teste.json`
continua versionado em `n8n/workflows/` e aceita payload camelCase
(`{documentId, projectId, filename, storagePath}`). Para usá-lo:

1. Ativar o workflow na UI do n8n (`http://localhost:5678`).
2. Confirmar que `AI_SERVICE_TOKEN` e `N8N_INGEST_TOKEN` estão expostos no
   container do n8n (`docker exec sinapse-n8n env | grep -E "AI_SERVICE_TOKEN|N8N_INGEST_TOKEN"`).
   O workflow lê de `$env.X` nos headers, **sem** precisar criar credencial
   na UI.
3. Chamar o webhook com um documento já cadastrado no banco:

   ```bash
   curl -X POST http://localhost:5678/webhook/sinapse-ingest \
     -H "Content-Type: application/json" \
     -d '{"documentId":"...","projectId":"...","filename":"x.md","storagePath":"<projectId>/<documentId>.md"}'
   ```

Esse canal é redundante com o worker oficial — serve para visualizar o
fluxo passo-a-passo no editor do n8n quando houver suspeita de problema
no ai-service.

## 6. Troubleshooting

| Sintoma | Causa provável | Correção |
|---|---|---|
| `docker compose up` falha com `Configure AI_SERVICE_TOKEN in .env` | `.env` não existe ou não tem o token | `cp .env.example .env` |
| Mesma mensagem com `DOCUMENT_INGESTION_TOKEN` | Token ausente ou com menos de 32 chars | Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Documento fica preso em `pendente` | Worker não está rodando ou crashou na primeira tentativa | `docker logs sinapse-backend \| grep -i document`; reinicie o container |
| Status muda para `falha` com `processamento_erro: "A autenticação interna da ingestão não está configurada."` | `DOCUMENT_INGESTION_TOKEN` diferente entre backend e ai-service | Confirme o mesmo valor nos dois (`docker exec sinapse-backend env`, `docker exec sinapse-ai-service env`) |
| Status `falha` com `invalid embedding dimension` | Ollama rodando com modelo diferente de `bge-m3` | `ollama pull bge-m3`; checar `OLLAMA_EMBEDDING_MODEL` |
| Status `falha` com `503 service unavailable` | ai-service não está no ar ou Ollama caiu | `docker logs sinapse-ai-service` / `curl http://localhost:11434` |
| `/admin/ingestion` dá 403 | Logado como PO/dev, não admin | Sessão de admin |
| UI "Reprocessar" responde mas documento não sai da fila | Worker reivindicou e falhou de novo | Olhe `processamento_erro` na próxima atualização; se for `503`, aguarde Ollama responder |

## 7. Avaliação da busca (S2-17)

```bash
docker exec sinapse-ai-service python -m evaluation.run_search_suite \
  --dataset evaluation/datasets/search-ptbr-v2.json
```

Relatório sai em stdout com Top-K accuracy, taxa de falso-positivo e
latência média. Datasets em `ai-service/evaluation/datasets/`.
