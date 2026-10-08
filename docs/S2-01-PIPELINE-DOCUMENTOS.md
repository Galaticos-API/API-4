# S2-01 — Pipeline assíncrono de documentos

Upload retorna com estado pendente. O worker consulta a fila persistida a cada 15 segundos, aguardando finalização do armazenamento e excluindo projetos arquivados. Estados: pendente, processando, processado e falha.

Tentativas usam lease de três minutos e timeout HTTP de dois minutos. Falhas transitórias usam backoff exponencial e até cinco tentativas por ciclo. Leases expirados são recuperados após reinício; expiração da quinta tentativa informa ATTEMPTS_EXHAUSTED. Falhas permanentes aguardam nova tentativa manual.

POST /api/v1/projects/{projectId}/documents/{documentId}/reprocess exige admin ou PO com acesso ao projeto e retorna 202. Pedidos repetidos enquanto pendente preservam a fila e os contadores. Lease ativo retorna 409. Após falha ou lease expirado, limpa diagnósticos e reinicia o ciclo. Documentos processados também podem ser reindexados, preservando o contrato existente.

GET /api/v1/projects/{projectId}/documents expõe estado, erro_processamento (motivo seguro), erro_processamento_codigo, tentativas_processamento e nova_tentativa_pendente. Respostas de leases substituídos e documentos removidos não restauram dados. O Node valida escopo e vetores e substitui os trechos atomicamente com IDs determinísticos e projeto de origem.

DOCUMENT_INGEST_WEBHOOK_URL seleciona o workflow n8n versionado; sem essa configuração, o backend chama a IA diretamente. Ative o workflow e encaminhe X-Service-Token. O workflow não salva payloads de execução. Logs registram somente IDs, tentativa, código, retry e status HTTP, sem conteúdo, credenciais ou exceções internas.

Validação: npm test e npm run typecheck no backend. documents.retry.test.ts verifica idempotência, conflito, lease expirado e motivos seguros. documents.ingestion.db.test.ts verifica falha, retry, leases, vetores e remoção com PostgreSQL migrado e ARCHIVE_TEST_DATABASE_URL apontando para um banco de testes permitido. Sem essa variável, os testes de banco são ignorados. Revisão do PR por outra pessoa permanece uma etapa humana.
