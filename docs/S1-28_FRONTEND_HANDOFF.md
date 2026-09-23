# S1-28 — integração segura do frontend

## Contratos usados

- Projetos, backlog, critérios, qualidade e arquivamento usam exclusivamente os endpoints já publicados pela `main`.
- Acervo, documentos e conversa ainda não possuem contrato de backend na `main`; as respectivas telas não simulam dados ou gravação.

## Critério de continuidade

Quando os endpoints forem disponibilizados, conectar cada tela pelo cliente HTTP dedicado, mantendo estados de carregamento, vazio, erro e acesso negado. Não alterar regras de domínio no frontend.
