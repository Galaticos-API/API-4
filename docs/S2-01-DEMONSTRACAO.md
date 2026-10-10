# Demonstração integrada S2-01

Data: 07/10/2026, 23:17:44 (America/Sao_Paulo).

Backend com código local, PostgreSQL 16/pgvector temporário, n8n e IA/Ollama reais. Migrações aplicadas, dados sintéticos, autenticação e chamadas HTTP reais. Worker acionado por tick explícito para controlar a demonstração; agendamento periódico não medido.

- Upload HTTP 201 em 58 ms; estado pendente.
- Falha controlada no caminho backend → n8n → IA real: token inválido recusado; motivo seguro: O serviço de processamento recusou a solicitação.
- Dois pedidos de retry HTTP 202 preservaram fila, contadores e timestamps.
- Estado processando observado pela API durante execução real.
- Consulta de projetos HTTP 200 durante processamento.
- Estado processado; 1 trecho(s), embeddings reais de 1024 dimensões, origem preservada e documento encontrado na busca.
- Busca no segundo projeto não retornou dados do primeiro.
- PDF truncado falhou na extração da IA real: INVALID_DOCUMENT; motivo: Não foi possível extrair o conteúdo do documento.
- Falha permanente de extração permite nova tentativa manual HTTP 202.

Asserções aprovadas. Banco e arquivos temporários removidos ao terminar; dados de desenvolvimento preservados. Sem credenciais no relatório.

Reproduzir no backend com serviços locais ativos: node --import tsx scripts/demo-s201.mts.
