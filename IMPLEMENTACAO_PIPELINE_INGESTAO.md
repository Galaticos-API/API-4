# Pipeline de ingestão de documentos — implementação e correções (S2-01/02/06/17)

Relatório técnico consolidado do trabalho feito na branch
`feature/s2-02-n8n.embedding`: unificação de três implementações paralelas
(S2-02/n8n, S2-01/worker do Giovanni, S2-06/S2-17 da branch `codex`),
correção dos bugs reais que impediam o pipeline de funcionar ponta a ponta,
e a tela local de observabilidade que substitui o editor do n8n.

Para o passo a passo de **como rodar e testar**, ver [`TESTE_INGESTAO.md`](TESTE_INGESTAO.md).
Este documento aqui é o **porquê** e o **o quê**.

## Arquitetura final

```
Upload (frontend, multipart/form-data)
  → backend grava documento (status_processamento = 'pendente')
  → DocumentIngestionWorker (tick a cada 15s) reivindica com lease
  → POST ai-service:8000/documents/process
      headers: X-Service-Token + X-Document-Ingestion-Token
      body: { document_id, project_id, filename, content_base64 }
  → ai-service extrai texto (PDF/DOCX/MD/TXT), faz chunking,
    gera embeddings via Ollama (bge-m3, 1024 dimensões)
  → backend persiste os chunks em `chunk` (vector(1024) + pgvector)
    e marca o documento como 'processado' — tudo numa transação
  → /admin/ingestion mostra o estado da fila em tempo real
  → /api/v1/search faz busca híbrida (full-text + similaridade vetorial)
```

O workflow do n8n (`n8n/workflows/*.json`) deixou de ser o canal oficial.
Ele continua versionado e funcional como **ferramenta de debug manual**
(dispara via `curl`, dá pra acompanhar nó a nó no editor), mas o caminho
real que roda em produção é só o worker acima — sem n8n no meio.

## O que foi implementado

### Unificação de três branches paralelas
- **S2-02** (esta branch): pipeline original via webhook do n8n.
- **S2-01** (`origin/s2-01-pipeline-assincrono-documentos`, Giovanni): worker
  assíncrono com estados `pendente/processando/processado/falha`, lease,
  retry e diagnóstico de erro.
- **codex/s2-17-ptbr-search-evaluation** (PR #44): reimplementação de
  S2-01/02 do zero + busca híbrida real (S2-06) + bateria de avaliação de
  busca em português (S2-17).

Mesclados nessa ordem (S2-01 → codex), resolvendo conflitos de arquitetura
(ver commits `875b276` e `cd689ad`). Decisão de design: adotada a
arquitetura "worker como canal canônico" da codex — o backend chama o
ai-service direto, sem depender do n8n estar no ar.

### Endpoints novos no ai-service
- `POST /documents/process` — endpoint oficial (fluxo S2-01): recebe o
  arquivo em base64, extrai texto conforme a extensão, faz chunking e
  gera embeddings, tudo numa chamada. Autenticado com
  `X-Document-Ingestion-Token` (mínimo 32 caracteres).
- `POST /chunk` e `POST /embed` — endpoints de debug para o workflow do
  n8n chamar passo a passo (chunking separado de embedding). Não fazem
  parte do fluxo oficial.

### Endpoint novo no backend
- `POST /api/v1/projects/:projectId/documents/:documentId/chunks` —
  recebe chunks já processados (usado pelo workflow do n8n em modo debug).
  Autenticado com `Authorization: Bearer <N8N_INGEST_TOKEN>`, separado da
  sessão de usuário humano.

### Tela de observabilidade (`/admin/ingestion`)
Como o n8n saiu do caminho principal, perdemos a visibilidade visual que o
editor dava. Reconstruída dentro da aplicação:
- `GET /api/v1/admin/ingestion` (backend) — snapshot agregado: contagens
  por status, documentos ativos, falhas recentes.
- `IngestionObservabilityView.tsx` (frontend) — 4 contadores grandes,
  pipeline visual animado por documento (Recebido → Processando →
  Indexado), seção de falhas com botão de reprocessar. Polling a cada 5s.

### Bootstrap do admin local
`backend/scripts/bootstrap-admin.mts` (`npm run bootstrap:admin`) — cria
ou promove o usuário admin de teste (`admin@sinapse.local` / `Admin@123`),
reaproveitando o `hashPassword()` real do backend. Resolve o impasse de
"cadastro público só cria dev, promover a admin exige sessão de admin" sem
precisar de SQL manual.

### Setup nativo sem Docker Desktop/WSL2
`backend/scripts/apply-native-no-vector.mjs` + seção dedicada em
`TESTE_INGESTAO.md`: todo o pipeline (Postgres, Ollama, backend, frontend,
ai-service) validado rodando nativo no Windows, sem Docker — útil para
quem não tem WSL2 disponível.

## Bugs encontrados e corrigidos

| # | Sintoma | Causa raiz | Correção | Commit |
|---|---|---|---|---|
| 1 | Upload pela UI nunca disparava o n8n | Frontend mandava o arquivo como `application/octet-stream` cru; backend (após mudar pra multer) exige `multipart/form-data` | `uploadDocument` monta `FormData`; `apiRequest` não força `Content-Type` quando o body é `FormData` | `f657380` |
| 2 | n8n recebia `401` em `/chunk` e `/embed` do ai-service | Workflow usava uma única credencial "Header Auth" pra dois endpoints com headers diferentes (`X-Service-Token` vs `Authorization: Bearer`) | Workflow lê os dois tokens direto de `$env.AI_SERVICE_TOKEN` / `$env.N8N_INGEST_TOKEN`, expostos no container do n8n — sem credencial manual na UI | `12530e8` |
| 3 | n8n caía no nó "Payload inválido" mesmo com tudo configurado certo | **Dupla ingestão**: o backend chamava o webhook do n8n (payload camelCase) *e* o worker da S2-01 chamava o mesmo webhook via `DOCUMENT_INGEST_WEBHOOK_URL` (payload snake_case + base64) — o n8n só entendia um dos dois formatos | Removida a chamada direta do `documents.service.ts` ao n8n; só o worker dispara, e por padrão vai direto pro ai-service (`DOCUMENT_INGEST_WEBHOOK_URL` vazio) | `2b6d9e8` |
| 4 | `docker compose up` falhava com `Configure AI_SERVICE_TOKEN/DOCUMENT_INGESTION_TOKEN in .env` | `.env.example` definia essas variáveis como obrigatórias (`:?`) mas as deixava vazias | Defaults de dev preenchidos no `.env.example`, com instrução de rotacionar em produção | `f74d640` |
| 5 | Arquivo gravado pelo backend ficava ilegível para o container do n8n | Backend salvava com `mode: 0o600` (só o dono lê); container roda como root, n8n roda como usuário `node` (não-root) — sem pgvector/Docker isso nem chega a ser testado, mas quebra o modo debug via n8n | `writeFile` com `mode: 0o644` | `64e6f0d` |
| 6 | **Todo documento falhava com `401` no ai-service**, mesmo com tokens corretos no `.env` | `HttpDocumentIngestionClient.process()` (worker oficial da S2-01, veio da branch codex) só mandava `X-Document-Ingestion-Token`; esqueceu `X-Service-Token`, exigido pelo middleware global do ai-service em *toda* rota — bug real, afeta Docker também, não só ambiente local | Usa o mesmo helper `serviceHeaders()` que `chat.service.ts`/`repo-analyses.service.ts` já usavam corretamente | `b1c7a60` |
| 7 | Geração de embedding falhava/travava de forma intermitente (`wsarecv: conexão forçada a cancelar`) | **Específico de ambiente local**: duas instâncias de `ollama serve` concorrendo pela porta 11434 (o instalador do Ollama já sobe uma via app de bandeja) | Matar todas as instâncias e subir uma única com `OLLAMA_KEEP_ALIVE=24h` | documentado em `TESTE_INGESTAO.md` |

Os bugs #1, #2, #3, #4, #5 e #6 afetam **qualquer ambiente** (Docker
inclusive) — não são específicos de rodar sem Docker. O #7 é específico de
quem roda Ollama nativo no Windows.

## Limitações conhecidas

- **pgvector não tem pacote nativo pro Windows.** Quem roda sem Docker
  precisa do shim documentado em `TESTE_INGESTAO.md` (`real[]` no lugar de
  `vector`, não commitável) — e mesmo assim a busca híbrida vetorial
  (`/api/v1/search`) não funciona nesse modo, só o full-text. Com o
  Docker do time (imagem `pgvector/pgvector:pg16`), tudo funciona normal.
- O workflow do n8n em `n8n/workflows/` não é mais testado automaticamente
  (sem CI cobrindo o fluxo de debug) — validação é manual, via `curl`,
  quando necessário.

## Como validar

Ver [`TESTE_INGESTAO.md`](TESTE_INGESTAO.md) — cobre os dois modos (Docker
e nativo), checklist de troubleshooting, e os comandos de avaliação da
busca (S2-17).

Verificação automatizada:
```bash
cd backend && npx tsc --noEmit && npm test       # 313/313
cd frontend && npx tsc -b && npm test             # 210/210
cd backend && npm run audit:security              # 0 vulnerabilidades
```
