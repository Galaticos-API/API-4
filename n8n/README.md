# Integração local de documentos

O backend recebe e valida o arquivo, finaliza o armazenamento e mantém uma fila durável no PostgreSQL. O worker chama `sinapse-ingest`; o workflow encaminha o corpo para `/ingest/file` no Python e devolve os trechos e vetores. Somente o backend grava os chunks e marca o documento como processado, em uma transação.

O workflow `sinapse-document-removed` recebe notificações depois que o Node removeu os chunks. O aceite do webhook confirma a entrega; não há outro índice externo para apagar. O backend mantém o evento pendente e tenta novamente quando não recebe uma resposta de sucesso.

## Instalação em uma nova instância

Execute na raiz do repositório, com o contêiner `sinapse-n8n` em execução:

```sh
docker cp n8n/workflows/kbeyMs38qerFoS65-sinapse-document-ingestion-trigger.json sinapse-n8n:/tmp/sinapse-ingest.json
docker cp n8n/workflows/sinapse-document-removed.json sinapse-n8n:/tmp/sinapse-removed.json
docker exec sinapse-n8n n8n import:workflow --input=/tmp/sinapse-ingest.json
docker exec sinapse-n8n n8n import:workflow --input=/tmp/sinapse-removed.json
docker exec sinapse-n8n n8n publish:workflow --id=kbeyMs38qerFoS65
docker exec sinapse-n8n n8n publish:workflow --id=sinapseDocumentRemoved
docker restart sinapse-n8n
```

Antes de importar sobre uma instalação com customizações, exporte os workflows atuais. A importação desativa o workflow até a publicação. O Compose configura os dois endereços internos no backend. Em execução fora do Docker, use `http://localhost:5678/webhook/...`.

O limite `N8N_PAYLOAD_SIZE_MAX=150` comporta o envelope base64 do limite máximo configurável de 100 MiB do backend. Consulte a [documentação de endpoints do n8n](https://docs.n8n.io/hosting/configuration/environment-variables/endpoints/).

## Recuperação

- Uma lease de três minutos identifica a tentativa. Resultados de leases antigas ou documentos removidos são descartados.
- Falhas temporárias deixam o documento em `falha` e são tentadas novamente com atraso crescente, até cinco tentativas. Arquivos inválidos e respostas incompatíveis exigem intervenção; não entram em retry automático. A API expõe `nova_tentativa_pendente`, número de tentativas, próxima tentativa e código sanitizado.
- `POST /api/v1/projects/{projectId}/documents/{documentId}/reprocess` reenfileira a ingestão; exige PO/admin e projeto não arquivado. A tela oferece essa ação quando há falha.
- O reprocessamento substitui os chunks na mesma transação e não duplica vetores.
- TXT/MD usam UTF-8, DOCX usa seu texto e PDF usa texto extraível. PDFs protegidos ou digitalizados sem camada de texto falham explicitamente; OCR não está implementado.
- Python prepara dados e não escreve no PostgreSQL. Falhas de embedding retornam erro, nunca sucesso de indexação.

## Autenticação interna

Configure `AI_SERVICE_TOKEN` com um segredo aleatório em `.env` antes de iniciar o Compose. Node e Python recebem o mesmo valor. O Node envia `X-Service-Token`; o workflow apenas encaminha esse cabeçalho recebido, sem armazenar o segredo no JSON. O workflow preserva o status HTTP do Python para distinguir erros permanentes de temporários. Reimporte e publique esta versão do workflow ao atualizar.

A porta do serviço Python não é publicada no host. Fora do Docker, configure a mesma variável nos dois processos. Sem configuração o Python recusa requisições de negócio; `/health` permanece disponível internamente.
