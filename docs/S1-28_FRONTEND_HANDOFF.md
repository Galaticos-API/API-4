# S1-28 — integração segura do frontend

## Contratos usados

- Projetos, backlog, critérios, qualidade e arquivamento usam exclusivamente os endpoints já publicados pela `main`.
- Acervo, documentos e conversa ainda não possuem contrato de backend na `main`; as respectivas telas não simulam dados ou gravação.

## Critério de continuidade

Quando os endpoints forem disponibilizados, conectar cada tela pelo cliente HTTP dedicado, mantendo estados de carregamento, vazio, erro e acesso negado. Não alterar regras de domínio no frontend.

## Documentos (S1-19, S1-20, S1-22)

- Contrato publicado em `docs/api/openapi.yaml`: `GET/POST /api/v1/projects/{projectId}/documents` e `DELETE /api/v1/projects/{projectId}/documents/{documentId}`.
- A aba **Documentos** do projeto consome esse contrato (`frontend/src/api/api_documents.ts`). Acervo (busca) e conversa continuam sem contrato.
- O envio é binário (`application/octet-stream` com `X-File-Name`); tipo, extensão e tamanho são validados no backend. O limite vem de `DOCUMENT_MAX_SIZE_MB` e é devolvido em `limites` na listagem.
- Perfis `admin` e `po` enviam e removem; `dev` apenas consulta. Projeto arquivado é somente leitura.
- A remoção grava o evento `document.removed` (outbox `evento_integracao`) quando há conteúdo indexado e o backend o publica em `DOCUMENT_EVENTS_WEBHOOK_URL`. O fluxo n8n consumidor ainda precisa ser criado.
