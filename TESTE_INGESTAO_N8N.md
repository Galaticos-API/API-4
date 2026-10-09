# Teste prático do pipeline de ingestão

Guia para rodar e validar o fluxo de ingestão de documento no Docker Desktop
usando `curl`, `docker exec` e um cliente SQL para o Postgres.

## Arquitetura em uma linha

Em uso real, o backend **não chama o n8n** depois do upload. Quem faz a
ingestão é o `DocumentIngestionWorker` (S2-01), que roda em background,
pega documentos `pendente` com lease/retry e chama **direto** o
ai-service (`POST /ingest/file`). O ai-service extrai texto, chunking,
embeddings e devolve os chunks, que o worker persiste em `chunk` na
mesma transação que marca `status_processamento = 'processado'`.

O workflow do n8n (`Sinapse - RAG Ingestão / Chat de teste`) continua
disponível como **ferramenta de debug manual** — útil para disparar o
pipeline fora do UI (via `curl`) e visualizar cada passo no editor do
n8n. É o que este guia cobre nos passos 4-6.

Se quiser rotear a ingestão oficial pelo n8n em vez do worker direto,
preencha `DOCUMENT_INGEST_WEBHOOK_URL` no `.env` apontando para o webhook
do n8n — nesse caso o workflow precisa aceitar o payload da S2-01
(`{document_id, project_id, file_name, content_base64}`), diferente do
shape que este guia usa.

## 0. Pré-requisitos

- Docker Desktop rodando.
- Ollama rodando no host (fora do Docker, como `AGENTS.md` manda) com o modelo
  `bge-m3` já baixado:

  ```bash
  ollama pull bge-m3
  ollama list       # confirme que bge-m3 aparece
  ```

- Arquivo `.env` na raiz. Em dev, o jeito mais simples é copiar o `.env.example`:

  ```bash
  cp .env.example .env
  ```

  O compose exige **três** variáveis preenchidas (sem elas o `docker compose up`
  falha antes de iniciar os containers):

  ```env
  AI_SERVICE_TOKEN=sinapse-dev-ai-service-token   # backend <-> ai-service
  N8N_INGEST_TOKEN=sinapse-dev-ingest-token       # n8n -> backend (/documents/.../chunks)
  N8N_ENCRYPTION_KEY=sinapse-shared-dev-encryption-key-2026
  ```

  Em produção, rotacione `AI_SERVICE_TOKEN` e `N8N_INGEST_TOKEN` para segredos
  aleatórios (ex.: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
  e **nunca** versione o valor real.

## 1. Subir a stack

```bash
docker compose up -d --build
docker compose ps
```

Confirme que `sinapse-backend`, `sinapse-ai-service`, `sinapse-n8n` e
`sinapse-postgres` estão `healthy`/`running`.

Sanity-check rápido:

```bash
curl http://localhost:3001/health        # backend
curl http://localhost:8000/health        # ai-service (ollama: "connected")
curl -I http://localhost:5678            # n8n (302 ou 200)
```

## 2. Autenticação server-to-server (sem configurar credencial no n8n)

O workflow lê os tokens diretamente do ambiente do container do n8n via
`$env.AI_SERVICE_TOKEN` e `$env.N8N_INGEST_TOKEN` — ambas já são injetadas
pelo `docker-compose.yml`. **Não é mais necessário** criar credencial
`Header Auth account` na UI do n8n.

Confirme que as duas variáveis estão no `.env` da raiz (o passo 0 já
cobre isso quando você faz `cp .env.example .env`). O workflow envia:

- `X-Service-Token: $AI_SERVICE_TOKEN` em `/chunk` e `/embed` (ai-service)
- `Authorization: Bearer $N8N_INGEST_TOKEN` em `/documents/.../chunks` (backend)

Se você rotacionar algum dos tokens em `.env`, basta `docker compose up -d`
de novo — o n8n re-lê o `$env` na próxima execução.

## 3. Ativar o workflow

1. Em `http://localhost:5678`, abra o workflow
   **"Sinapse - RAG Ingestão / Chat de teste"**.
2. Clique no toggle no canto superior direito até aparecer **Active**.
3. Confirme que o webhook de produção responde (não é 404):

   ```bash
   curl -i -X POST http://localhost:5678/webhook/sinapse-ingest \
     -H "Content-Type: application/json" -d '{}'
   ```

   Se vier `404 "The requested webhook ... is not registered"`, o workflow não
   está ativado — volte ao passo 2. **Nunca** troque para `/webhook-test/`
   (esse endpoint só atende uma chamada por clique em "Execute workflow" no
   editor; o backend chamando em loop vai sempre dar 404).

## 4. Preparar o cenário de teste

Precisamos de um projeto ativo + um registro de documento + o arquivo físico no
volume `/files` (compartilhado entre backend e n8n via `./storage`).

### 4.1. Criar projeto + documento no Postgres

Cole no `psql` do container (ou em qualquer cliente SQL apontado para
`localhost:55432`):

```bash
docker exec -it sinapse-postgres psql -U sinapse -d sinapse <<'SQL'
INSERT INTO projeto (id, nome, cliente, status)
VALUES ('11111111-1111-4111-8111-111111111111', 'Projeto Teste S2-02', 'PRO4TECH', 'ativo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO documento (id, projeto_id, nome, extensao, mime, caminho, status_processamento)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'exemplo.txt', '.txt', 'text/plain',
  '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.txt',
  'pendente'
)
ON CONFLICT (id) DO NOTHING;
SQL
```

### 4.2. Colocar o arquivo em `./storage` (no host)

```bash
mkdir -p ./storage/11111111-1111-4111-8111-111111111111
cat > ./storage/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.txt <<'EOF'
O Sinapse é a memória institucional da PRO4TECH.
Converte requisitos em conhecimento reutilizável, com proveniência por campo,
ciclo humano de sugestões e busca semântica isolada por projeto.

A ingestão de documentos passa pelo n8n: ele lê o arquivo do volume compartilhado,
chama o ai-service para chunking e embeddings bge-m3, e persiste no backend Node.
EOF
```

Confirme que o n8n enxerga o arquivo com o fix de permissão (`0o644`):

```bash
docker exec sinapse-n8n sh -c "ls -la /files/11111111-1111-4111-8111-111111111111/"
docker exec sinapse-n8n sh -c "cat /files/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.txt | head -c 100"
```

Se `cat` falhar com `Permission denied`, o arquivo veio de um upload feito antes
do fix de permissão — rode `chmod -R o+r ./storage` no host e tente de novo.

## 5. Disparar o pipeline

Simula o que o backend faz após um upload bem-sucedido:

```bash
curl -i -X POST http://localhost:5678/webhook/sinapse-ingest \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "22222222-2222-4222-8222-222222222222",
    "projectId":  "11111111-1111-4111-8111-111111111111",
    "filename":   "exemplo.txt",
    "storagePath": "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.txt"
  }'
```

Resposta esperada: `200` do nó **Resposta HTTP** (o workflow termina com
`respondToWebhook` depois que o backend confirma a persistência).

## 6. Validar o resultado

```bash
docker exec -it sinapse-postgres psql -U sinapse -d sinapse <<'SQL'
-- Documento deve ter virado 'processado'
SELECT id, nome, status_processamento, updated_at
  FROM documento
 WHERE id = '22222222-2222-4222-8222-222222222222';

-- Chunks indexados com embedding 1024d (bge-m3)
SELECT entidade_id, LEFT(texto, 60) AS preview, vector_dims(embedding) AS dim, metadados_json->>'chunk_index' AS idx
  FROM chunk
 WHERE entidade_tipo = 'documento'
   AND entidade_id = '22222222-2222-4222-8222-222222222222'
 ORDER BY (metadados_json->>'chunk_index')::int;

-- Auditoria registrou o evento
SELECT acao, dados_json, created_at
  FROM auditoria
 WHERE entidade_id = '22222222-2222-4222-8222-222222222222'
 ORDER BY created_at DESC
 LIMIT 3;
SQL
```

Critérios de sucesso:

- `status_processamento = 'processado'` no `documento`
- Pelo menos 1 linha em `chunk` com `dim = 1024`
- Linha de auditoria com `acao = 'INDEXAR_DOCUMENTO'`, `dados_json.fonte = 'n8n_pipeline'`

Reexecute o `curl` do passo 5: deve continuar funcionando (reindexação
idempotente substitui os chunks anteriores, não duplica).

## 7. Testar o fluxo real de upload (opcional)

Para fechar o loop com a entrada normal (quem usa a UI faz exatamente isso),
suba um arquivo pelo endpoint autenticado:

```bash
# Logue como PO/admin pra pegar o cookie de sessão
curl -i -c cookies.txt -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<senha>"}'

# Upload: o backend grava o arquivo com 0o644, registra o documento,
# e chama o webhook do n8n automaticamente
curl -i -b cookies.txt -X POST \
  http://localhost:3001/api/v1/projects/11111111-1111-4111-8111-111111111111/documents \
  -F "file=@./meu-documento.pdf"
```

Depois rode as queries do passo 6 com o `documentId` que o backend retornou.

## 8. Troubleshooting

| Sintoma | Causa provável | Correção |
|---|---|---|
| Webhook responde `404 "not registered"` | Workflow não ativado | Passo 3 |
| Nó "Persistir chunks (backend)" dá `401 "INGEST_TOKEN_INVALID"` | `N8N_INGEST_TOKEN` ausente no `.env` ou diferente entre backend e n8n | Confirme a mesma linha nos dois containers com `docker exec sinapse-n8n env \| grep N8N_INGEST_TOKEN` e `docker exec sinapse-backend env \| grep N8N_INGEST_TOKEN` |
| Nós "Chunking" ou "Embeddings" dão `401 "Autenticação interna necessária"` | `AI_SERVICE_TOKEN` ausente ou diferente entre backend/ai-service/n8n | Idem acima, grep por `AI_SERVICE_TOKEN` nos três containers |
| `Ler arquivo de /files` dá `EACCES` / Permission denied | Arquivo de upload antigo com `0o600` | `chmod -R o+r ./storage` no host |
| `Chunking (ai-service)` dá `ECONNREFUSED` | ai-service não subiu | `docker compose logs ai-service` |
| `Embeddings bge-m3` dá `502` | Ollama não tem o modelo ou está parado | `ollama pull bge-m3`; checar firewall `host.docker.internal` |
| `Persistir chunks (backend)` dá `400 "embedding fora do padrão bge-m3"` | ai-service respondeu vetor != 1024d | Confirme que `OLLAMA_EMBEDDING_MODEL=bge-m3` no `.env` |
| `Persistir chunks (backend)` dá `404 "Documento não encontrado"` | Enviou `documentId` que não existe no `documento` para esse `projectId` | Passo 4.1 |
| `Persistir chunks (backend)` dá `409 ARCHIVE_CONFLICT` | Projeto arquivado | `UPDATE projeto SET status='ativo' WHERE id = ...` |

## 9. Limpar depois do teste

```bash
docker exec -it sinapse-postgres psql -U sinapse -d sinapse <<'SQL'
DELETE FROM projeto WHERE id = '11111111-1111-4111-8111-111111111111';
SQL
rm -rf ./storage/11111111-1111-4111-8111-111111111111
```

(`chunk`, `documento` e `auditoria` seguem o `ON DELETE CASCADE` do `projeto`.)
