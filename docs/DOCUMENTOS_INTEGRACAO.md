# Documentos: upload, remoção, outbox e escopo (S1-19, S1-20, S1-22)

> Pipeline de ingestão atualizado para S2-01/S2-02. Expurgo administrativo e indexação do backlog são entregas separadas. Veja também a [arquitetura](Architecture/README.md)
> e a [referência da API](api/openapi.yaml).

## Escopo desta entrega x Sprint 2

| Item | Estado |
|---|---|
| Upload seguro (PDF, DOCX, MD, TXT), armazenamento e auditoria | Implementado na S1 |
| Extração, chunking, embeddings locais e persistência transacional dos chunks | Implementado na S2-01/S2-02 |
| Estados `pendente → processando → processado/falha`, lease recuperável e erro visível | Implementado na S2-01 |
| Retry explícito de falhas | `POST /api/v1/projects/{projectId}/documents/{documentId}/retry` |
| Remoção do documento e chunks no escopo do projeto | Implementado na S1 |

O backend reserva no máximo um documento por ciclo com `FOR UPDATE SKIP LOCKED` e lease de 30 minutos. Reinício do backend permite recuperar reservas expiradas. O backend lê o arquivo do storage, envia-o ao serviço local, valida escopo, chunks/vetores e persiste tudo numa transação; o serviço Python não grava no banco. A repetição substitui os chunks anteriores no mesmo commit, preservando projeto e documento nos metadados. A resposta é limitada a 500 chunks de até 1.000 caracteres cada e vetores de 1.024 dimensões; resposta com IDs/metadados divergentes é rejeitada.

PDFs com camada textual são extraídos sem OCR; PDFs compostos apenas por imagens ficam sem texto indexável e são marcados como falha. Em DOCX, a extração percorre parágrafos e células de tabelas na ordem do corpo do documento. Limites contra arquivos excessivos: 20 MiB de conteúdo, 5.000 páginas/entradas DOCX, 100 MiB descompactados e 2 milhões de caracteres extraídos.

Falhas definidas de extração/vetorização mudam o estado para `falha` e armazenam uma mensagem genérica sem conteúdo do arquivo, caminho ou detalhes internos. A pessoa com permissão de escrita pode agendar novo processamento; o retry não cria tentativas concorrentes para documentos já processando.

## Fluxo de upload

1. `POST /api/v1/projects/{id}/documents` recebe o corpo binário e o nome em `X-File-Name`. Somente `admin` e `po`.
2. O tipo é decidido pelo **conteúdo** (assinatura PDF, ZIP com `word/document.xml`, texto UTF-8 sem NUL) e pela extensão; o `Content-Type` do cliente é ignorado.
3. O arquivo é gravado em área temporária (`.uploading`), o registro e a auditoria entram numa transação que trava a hierarquia (mesmo lock do arquivamento) e revalida que o projeto está ativo.
4. Após o commit, o arquivo é finalizado. Se a finalização falhar, a operação durável `finalizar_upload` fica pendente, o documento é devolvido com `armazenamento_pendente: true` e o worker conclui depois.
5. Projeto arquivado devolve 409 (`ARCHIVE_CONFLICT`) e não deixa arquivo nem registro.

## Fluxo de remoção

1. `DELETE /api/v1/projects/{id}/documents/{documentId}`: o arquivo é movido para `.removing`.
2. Numa transação com o lock de hierarquia: revalida projeto ativo, apaga `documento` e `chunk`, grava a operação `descartar_remocao`, o evento `document.removed` (quando havia conteúdo indexado) e a auditoria.
3. Erro ou arquivamento concorrente: rollback e o arquivo volta ao lugar (409 no arquivamento). Se a restauração falhar, a operação de reconciliação garante a recuperação e a resposta informa isso sem afirmar que o arquivo está disponível.
4. Repetir a remoção devolve 204 e não altera nada; documento de outro projeto nunca é tocado.

## Worker de manutenção

Iniciado com o backend (`startDocumentsBackgroundWorker`, a cada 15 s). Independe de qualquer `DELETE`.

- **Ingestão**: reserva um documento pronto para leitura, sem upload ainda pendente; faz extração/embedding fora da transação e grava chunks + estado `processado` atomicamente. Se o worker cair, a lease expira; se processamento falhar, o estado fica visível e o retry é manual.

- **Outbox** (`evento_integracao`): reserva em lote com `FOR UPDATE SKIP LOCKED` e lease de 1 minuto (duas instâncias não pegam o mesmo evento); falha aplica backoff exponencial (15 s até 1 h) e grava só uma mensagem genérica em `last_error`.
- **Armazenamento** (`documento_operacao_armazenamento`): mesma reserva e backoff para finalizar uploads e descartar remoções.
- **Reconciliação** a cada 5 min: arquivos `.uploading` e `.removing` só são tratados após período de graça de 5 min; com documento vinculado o arquivo é finalizado/restaurado, sem vínculo é descartado.
- Logs não contêm nome de arquivo, conteúdo, caminho, SQL ou URL do webhook.

## Observabilidade

`GET /health` inclui `documents`:

```json
{ "eventos_pendentes": 0, "evento_mais_antigo_segundos": 0, "operacoes_armazenamento_pendentes": 0,
  "webhook_configurado": false, "alertas": [] }
```

`alertas` lista: webhook ausente com eventos pendentes, evento pendente há mais de 1 hora, operações de armazenamento aguardando reconciliação. Monitore `alertas.length > 0`.

## Configuração

| Variável | Padrão | Uso |
|---|---|---|
| `DOCUMENT_MAX_SIZE_MB` | `20` | Limite por arquivo, entre 0 e 20 MiB, aplicado no backend e informado em `limites.max_bytes` |
| `DOCUMENT_STORAGE_DIR` | `storage/documents` | Diretório dos arquivos (volume `documents_data` no compose) |
| `DOCUMENT_EVENTS_WEBHOOK_URL` | vazio | Webhook do consumidor de `document.removed` |
| `AI_SERVICE_URL` | `http://localhost:8000` | Serviço local Python para extração e embeddings |
| `DOCUMENT_INGESTION_TOKEN` | obrigatório no Compose | Segredo aleatório compartilhado entre Node e IA; gere ao menos 32 bytes de entropia e nunca use valor fixo/versionado |

Não há token padrão de desenvolvimento. O Compose exige o segredo no `.env`; o backend e o serviço de IA também validam sua configuração em produção. A porta do serviço de IA publica somente em `127.0.0.1` por padrão.

## Contrato do consumidor de `document.removed`

Entrega ao menos uma vez. Cabeçalho `Idempotency-Key` = `event_id` = `document.removed:{document_id}`. Corpo em `docs/api/openapi.yaml` (`DocumentRemovedEvent`). O consumidor deve:

1. Deduplicar por `event_id`.
2. Excluir de forma idempotente todo conteúdo externo de `document_id` no escopo de `project_id`.
3. Responder 2xx apenas após concluir (qualquer outro status mantém o evento em retentativa).

Os `chunk` no PostgreSQL já são removidos pelo backend na mesma transação; o evento existe para índices externos.

### Workflow n8n de exemplo

`docs/integrations/n8n-document-removed.example.json` é um ponto de partida importável (webhook `sinapse-document-removed` que confirma o recebimento). Ele **não** está em `n8n/workflows/` porque a criação, ativação e o `n8n-sync validate` dependem da instância n8n da equipe. Pendência de integração: criar/ativar o workflow definitivo e preencher `DOCUMENT_EVENTS_WEBHOOK_URL`. Sem isso, os eventos ficam pendentes com retentativa e o `/health` alerta.

## Como validar

### Smoke ponta a ponta dos quatro formatos

O smoke [`scripts/smoke_document_lifecycle.py`](../scripts/smoke_document_lifecycle.py) valida upload autenticado, worker, extração/chunks, busca com origem e remoção para PDF, DOCX, Markdown e TXT. Ele cria arquivos sintéticos e tenta remover cada documento, inclusive na saída por erro. Execute somente em um **projeto descartável** acessível à sessão; a remoção ainda cria registros normais de auditoria/outbox.

No PowerShell, defina a sessão e o UUID do projeto descartável sem colocar credenciais na linha de comando ou no histórico:

```powershell
$env:SINAPSE_SESSION_COOKIE = '<cookie da sessão de QA>'
$env:SINAPSE_PROJECT_ID = '<uuid do projeto descartável>'
python scripts/smoke_document_lifecycle.py --confirm-disposable
Remove-Item Env:SINAPSE_SESSION_COOKIE
Remove-Item Env:SINAPSE_PROJECT_ID
```

O script não imprime nem grava a sessão. Cada formato tem um prazo máximo de 10 minutos, configurável com `--timeout`; falha se processamento, busca ou remoção não confirmar o resultado esperado.

```bash
cd backend
npm test
npm run build
python -m unittest discover -s ../ai-service/tests -p "test_chunker.py"
python -m unittest discover -s ../ai-service/tests -p "test_document_ingestion.py"
```

Os testes de banco cobrem migração 012 (banco limpo e já na 011, idempotência e dados legados), corrida arquivamento x upload/remoção, lease e backoff da outbox, operações de armazenamento e paginação estável isolada por projeto. Para habilitar as suítes PostgreSQL, configure URLs de banco descartável documentadas no [guia de setup](SETUP_GUIDE.md); no PowerShell use `$env:NOME_DA_VARIAVEL = '...'`. Nunca aponte essas variáveis para uma base compartilhada ou produção. Os testes E2E de navegador estão em `e2e/` (ver [README E2E](../e2e/README.md)).
