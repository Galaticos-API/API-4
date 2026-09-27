# Documentos: upload, remoção, outbox e escopo (S1-19, S1-20, S1-22)

## Escopo desta entrega x Sprint 2

| Item | Entregue (Sprint 1) | Fica para a S2-01 |
|---|---|---|
| Upload seguro (PDF, DOCX, MD, TXT) com tipo real, tamanho, armazenamento e auditoria | Sim | — |
| Listagem por projeto com metadados, cursor e estado | Sim | — |
| Remoção confirmada, idempotente, com limpeza de metadados, arquivo e chunks | Sim | — |
| Evento `document.removed` gravado na mesma transação (outbox) e entregue por worker | Sim | — |
| Extração de texto, chunking, embeddings e transição `pendente → processando → processado/falha` | Não | Sim |
| Disponibilidade do conteúdo na busca e no chat | Não | Sim |

`pendente` significa **armazenado e aguardando ingestão**. A interface e o OpenAPI não prometem indexação.
S1-21 trata de protótipos de PBIs e não tem relação com a ingestão.

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
| `DOCUMENT_MAX_SIZE_MB` | `20` | Limite por arquivo, aplicado no backend e informado em `limites.max_bytes` |
| `DOCUMENT_STORAGE_DIR` | `storage/documents` | Diretório dos arquivos (volume `documents_data` no compose) |
| `DOCUMENT_EVENTS_WEBHOOK_URL` | vazio | Webhook do consumidor de `document.removed` |

## Contrato do consumidor de `document.removed`

Entrega ao menos uma vez. Cabeçalho `Idempotency-Key` = `event_id` = `document.removed:{document_id}`. Corpo em `docs/api/openapi.yaml` (`DocumentRemovedEvent`). O consumidor deve:

1. Deduplicar por `event_id`.
2. Excluir de forma idempotente todo conteúdo externo de `document_id` no escopo de `project_id`.
3. Responder 2xx apenas após concluir (qualquer outro status mantém o evento em retentativa).

Os `chunk` no PostgreSQL já são removidos pelo backend na mesma transação; o evento existe para índices externos.

### Workflow n8n de exemplo

`docs/integrations/n8n-document-removed.example.json` é um ponto de partida importável (webhook `sinapse-document-removed` que confirma o recebimento). Ele **não** está em `n8n/workflows/` porque a criação, ativação e o `n8n-sync validate` dependem da instância n8n da equipe. Pendência de integração: criar/ativar o workflow definitivo e preencher `DOCUMENT_EVENTS_WEBHOOK_URL`. Sem isso, os eventos ficam pendentes com retentativa e o `/health` alerta.

## Como validar

```bash
cd backend && npm test && npm run build
# Com PostgreSQL descartável (nome terminando em _test):
ARCHIVE_TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/sinapse_x_test \
BACKLOG_TREE_TEST_DATABASE_URL=$ARCHIVE_TEST_DATABASE_URL npm test
```

Os testes de banco cobrem migração 012 (banco limpo e já na 011, idempotência e dados legados), corrida arquivamento x upload/remoção, lease e backoff da outbox, operações de armazenamento e paginação estável isolada por projeto. Os testes E2E de navegador estão em `e2e/` (ver `e2e/README.md`).
