# S1-23 — Roteiro de review e registro de execução

## Ambiente da execução registrada

- Data: 2026-09-25.
- Windows 11, Node 24, Google Chrome estável.
- PostgreSQL 18 embutido (`embedded-postgres`), banco descartável `*_test`. Como o binário não traz pgvector, a coluna
  `chunk.embedding` e o índice HNSW foram substituídos por `real[]`/omitidos **somente nesta execução local**; o CI usa
  `pgvector/pgvector:pg16` com o schema original.
- Backend real (`tsx src/index.ts`) e frontend Vite reais; serviço de IA e n8n **não** executados.

## Comandos

```bash
# 1. Backend: build, unidade, rotas, contrato OpenAPI e testes com PostgreSQL
cd backend
npm ci && npm run build
ARCHIVE_TEST_DATABASE_URL=postgresql://USER:PASS@localhost:5432/sinapse_x_test \
BACKLOG_TREE_TEST_DATABASE_URL=$ARCHIVE_TEST_DATABASE_URL \
SEED_TEST_DATABASE_URL=$ARCHIVE_TEST_DATABASE_URL npm test
npm run test:seed

# 2. Frontend
cd ../frontend && npm ci && npx tsc -b && npm test && npm run build

# 3. E2E de navegador (banco migrado, backend em :3001 e frontend em :5173 em execução)
cd ../e2e && npm ci && E2E_CHROME_PATH="<caminho do chrome>" npm test
```

No GitHub: workflow **E2E (navegador)** (`workflow_dispatch`) executa o passo 3; o `ci.yml` executa os passos 1 e 2 e os
testes de PostgreSQL (`validate-seed`).

## Resultado registrado

| Verificação | Resultado |
|---|---|
| `backend` `npm run build` (tsc) | Aprovado |
| `backend` `npm test` com PostgreSQL | **318 aprovados, 0 falhas, 0 ignorados** |
| `backend` `npm run test:seed` / `seed:validate` | 6 aprovados / manifesto válido (15 registros) |
| `frontend` `tsc -b` e `npm run build` | Aprovados |
| `frontend` `npm test` | **192 aprovados** (27 arquivos) |
| `e2e` `npm test` | **22 aprovados** (documentos 7, assistentes 5, fluxos 6, hierarquia pela UI 2, acessibilidade 2) |
| axe-core (WCAG 2 A/AA) em login, projetos, projeto (5 abas), PBI, chat, conhecimento | 0 violações críticas ou sérias |
| `openapi.contract.test` | 4 aprovados: documentado ⊆ implementado, implementado ⊆ documentado, protegidos respondem 401, públicos são 4 |
| Migrations 001–013 em banco limpo e 012/013 sobre banco existente | Aprovadas, idempotentes, dados legados preservados |

## Achados corrigidos durante a S1-23

| Achado | Gravidade | Correção |
|---|---|---|
| Cadastro público aceitava `role: "admin"` | Crítica | Administrador só com sessão de administrador (403); opção removida do formulário |
| Chat: leitura e escrita em conversa de outro usuário; fallback retornava trechos de todos os projetos sem relação com a pergunta | Alta | Posse da conversa (404), escopo por projeto, busca textual honesta com `origem` |
| OpenAPI: rotas de arquivamento sem `/api/v1`; 20+ endpoints entregues sem documentação | Média | Corrigido e coberto por teste de contrato |
| Contraste insuficiente (texto branco sobre laranja, cinza `--dim`) em todas as telas | Média (WCAG AA) | Botão primário com texto escuro (padrão do protótipo) e `--dim` elevado |
| `/api/v1/search` retornava 500 para `projeto_id` inválido e tratava `%`/`_` como curingas | Baixa | Validação de UUID (400) e escape |
| RepoAnalyzer API: UUID inválido → 500, projeto inexistente/arquivado sem tratamento | Média | 400/404/409/503 padronizados |
| Cabeçalho e abas transbordavam em 390 px | Baixa | Responsivo corrigido; E2E valida sem overflow |

## Checklist de revisão manual (a executar no review)

Teclado (sem mouse): login → projetos → projeto → abas por setas/Home/End → documentos (Escolher arquivo, Remover, Esc fecha o
diálogo) → backlog (busca, filtros, expandir) → PBI (Novo cenário, Registrar decisão) → chat (Enter envia, Shift+Enter quebra).
Conferir foco visível, rótulos lidos por leitor de tela e mensagens de erro anunciadas.

Perfis: repetir os fluxos com `po` e `dev`; `dev` deve consultar e nunca ver ações de escrita.

## Limitações declaradas

- O E2E usa PostgreSQL sem pgvector e sem serviço de IA/n8n; busca semântica e RAG (Sprint 2) estão fora do escopo.
- O workflow E2E do GitHub é manual e ainda não foi executado no GitHub Actions (somente localmente).
- Contraste foi verificado por axe em estado padrão; estados `hover` e telas de erro raras não foram varridos.
- Migrar/remover os componentes legados descritos em `S1-23-matriz-cenarios.md` fica como pendência.
- Não há teste de carga nem de segurança externa (pentest). Riscos residuais conhecidos: `cors()` aberto (ajustar origens em
  produção), ausência de cabeçalhos de segurança (helmet), token de sessão em `localStorage` (mitigado por expiração e escopo).

## Revisão independente

**Estado: pendente.** Este documento e a execução acima foram produzidos pelo autor. A aprovação independente deve ser
registrada abaixo por QA/outra pessoa, com um dos resultados:

- [ ] Aprovado sem pendências
- [ ] Aprovado com pendências objetivas (listar)
- [ ] Reprovado (listar bloqueios)

Pendências objetivas já conhecidas para o revisor considerar: (1) executar o workflow E2E no GitHub; (2) validar o consumidor
n8n de `document.removed`; (3) decidir o destino dos componentes legados do frontend; (4) endurecer CORS/cabeçalhos antes de produção.
