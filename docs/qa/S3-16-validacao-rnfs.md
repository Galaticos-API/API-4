# S3-16 — Relatório de Validação de Requisitos Não Funcionais (RNFs)

**Data:** 22/11/2026  
**Sprint:** 3  
**PBIs Validados:** `PBI-04.1.1`, `PBI-04.1.2`, `PBI-04.1.3`, `PBI-04.1.4`, `PBI-05.1.1`, `PBI-05.1.2`, `PBI-05.1.3`, `PBI-05.1.4`, `PBI-05.2.1`  
**Áreas Envolvidas:** QA, Segurança, DevOps

---

## 1. Resumo Executivo

Todos os Requisitos Não Funcionais (RNFs) exigidos na Sprint 3 foram validados em ambiente local real (`PostgreSQL 16 + pgvector`, `Node.js 20 + Express`, `React 19 + Vite`, `Python 3.11 + FastAPI` e `Ollama` local com `BAAI/bge-m3` e `qwen2.5:1.5b`):

| RNF | Meta / Critério | Resultado Observado | Status |
|---|---|---|---|
| **Desempenho — Busca Híbrida** | Latência `< 2.000 ms` (`< 2 s`) | Média: **555,2 ms** · Máximo: **780 ms** | ✅ Aprovado |
| **Desempenho — Primeira Resposta do Chat** | Primeira resposta `< 5.000 ms` (`< 5 s`) | TTFB: **6–12 ms** · 1º chunk de evidência: **12 ms a 2.965 ms** | ✅ Aprovado |
| **Autorização e Isolamento por Projeto (RNF-03)** | Filtro estrito por `projeto_id` e RBAC (`admin`, `po`, `dev`) | `401/403/404` verificados; revogação em tempo real bloqueia vazamento | ✅ Aprovado |
| **Privacidade e LGPD (RNF-09)** | Apenas dados profissionais em perfis; zero dados sensíveis em logs | Bloqueio de CPF, telefone, endereço, nascimento e e-mail em campos livres (HTTP `400`) | ✅ Aprovado |
| **Acessibilidade e Responsividade** | Navegação por teclado, foco modal, ARIA e zero overflow em `390 px` | `13/13` E2E browser + `316` testes de componentes frontend aprovados | ✅ Aprovado |
| **Operação 100% Local e Offline (RNF-04)** | Inferência e embeddings locais via Ollama sem provedor externo | Stack funcional via `localhost` / `host.docker.internal` sem chamadas externas | ✅ Aprovado |

---

## 2. Desempenho: Busca Híbrida (`< 2 s`)

Bateria executada contra `GET /api/v1/search?projeto_id=<UUID>&q=<termo>&limit=5` combinando similaridade cosseno HNSW (`pgvector` 1024 dimensões via `bge-m3`) e busca textual (`to_tsvector('portuguese', ...)`):

| Projeto | Consulta (`q`) | Resultados | Latência Interna (`metrics.latency_ms`) | Latência HTTP Total |
|---|---|:---:|:---:|:---:|
| Plataforma Sinapse | `pgvector embeddings 1024` | 2 | 753 ms | **780 ms** |
| Plataforma Sinapse | `critérios qualidade PBI verbo infinitivo` | 1 | 532 ms | **541 ms** |
| Plataforma Sinapse | `Azure DevOps burndown sprint` | 1 | 481 ms | **490 ms** |
| Portal de Pagamentos PIX | `Idempotency-Key Redis RabbitMQ` | 1 | 474 ms | **483 ms** |
| Portal de Pagamentos PIX | `validação chave PIX DICT 800ms` | 5 | 545 ms | **554 ms** |
| Portal de Pagamentos PIX | `conciliação estorno ledger transacional` | 4 | 503 ms | **513 ms** |
| Sistema de Autenticação Unificada | `OpenID Connect OAuth JWT RS256` | 1 | 543 ms | **552 ms** |
| Sistema de Autenticação Unificada | `cookie HttpOnly SameSite refresh token` | 2 | 552 ms | **562 ms** |
| Sistema de Autenticação Unificada | `auditoria logs segredo bloqueio tentativas` | 1 | 513 ms | **522 ms** |

- **Média HTTP:** `555,2 ms`
- **Máximo HTTP:** `780 ms` (61% abaixo do teto de `2.000 ms`).

---

## 3. Desempenho: Primeira Resposta do Chat (`< 5 s`)

Bateria executada nos endpoints `POST /api/v1/chat/query` e `POST /api/v1/chat/query/stream` (SSE com streaming incremental de evidências validadas):

| Projeto | Pergunta | TTFB / 1º Evento SSE | 1º Chunk de Evidência / Resposta | Tempo Total |
|---|---|---:|---:|---:|
| Plataforma Sinapse | `Quem trabalhou com TypeScript?` *(consulta determinística de equipe — PBI-05.2.1)* | < 10 ms | **23 ms** | **23 ms** |
| Plataforma Sinapse | `Qual é a previsão do tempo amanhã?` *(bloqueio determinístico fora do escopo — PBI-04.1.3)* | < 10 ms | **12 ms** | **12 ms** |
| Plataforma Sinapse | `Resuma o projeto Plataforma Sinapse` | < 15 ms | **625 ms** | **625 ms** |
| Portal de Pagamentos PIX | `Resuma o projeto Portal de Pagamentos PIX` | < 15 ms | **586 ms** | **586 ms** |
| Sistema de Autenticação Unificada | `Resuma o projeto Sistema de Autenticação Unificada` | < 15 ms | **548 ms** | **548 ms** |
| Plataforma Sinapse | `O que precisa existir em um PBI para atender aos critérios de qualidade?` *(SSE + LLM `qwen2.5:1.5b`)* | **24 ms** | **2.965 ms** | **5.219 ms** |
| Portal de Pagamentos PIX | `Como funciona o cabeçalho Idempotency-Key no envio PIX?` *(SSE + LLM `qwen2.5:1.5b`)* | **7 ms** | **2.545 ms** | **5.116 ms** |
| Sistema de Autenticação Unificada | `Quais dados são proibidos nos logs de auditoria?` *(SSE + LLM `qwen2.5:1.5b`)* | **8 ms** | **2.440 ms** | **2.602 ms** |

- Todas as consultas entregam o primeiro evento SSE (`progress: searching`) em **7–24 ms** e o primeiro trecho verificado de resposta (`evidence_chunk` ou resposta completa) em **12 ms a 2.965 ms** (`< 3 s`, muito abaixo do limite de `5.000 ms`).

---

## 4. Autorização, RBAC e Isolamento por Projeto (RNF-03)

Verificado por suítes automatizadas sobre PostgreSQL real (`search.access.db.test.ts`, `rag.db.test.ts`, `team.db.test.ts`, `user-roles.test.ts`, `test-main-regressions.mts`):

1. **Isolamento estrito em Busca e RAG (`WHERE projeto_id = $1`):**
   - Desenvolvedor (`role = 'dev'`) só acessa projetos em que possui alocação ativa (`data_inicio <= NOW()` e `data_fim IS NULL OR data_fim >= NOW()`).
   - Consultas de `dev` a projetos sem alocação retornam `404 Projeto não encontrado` **antes** de acionar o cálculo de embeddings no serviço de IA.
   - Códigos canários sintéticos (`SIN-QA-314`, `PIX-QA-731`, `SSO-QA-284`) nunca cruzam fronteiras de projeto.
2. **Revogação concorrente (Time-of-Check to Time-of-Use):**
   - Se a alocação de um desenvolvedor é encerrada, o usuário é desativado ou um documento perde elegibilidade durante a geração da resposta pelo modelo, a etapa `source_revalidation` aborta a resposta com `503` sem divulgar nenhum trecho.
3. **Controle de Papéis (PBI-06.2.1 / S3-13):**
   - `dev` possui acesso estritamente somente-leitura nos itens de trabalho (`DevReadOnly.test.tsx` e `user-roles.test.ts`: qualquer tentativa de escrita retorna `403`).
   - O último administrador ativo da plataforma é protegido por lock transacional (`409 Conflict` ao tentar rebaixar ou desativar).

---

## 5. Privacidade, LGPD e Sanitização de Logs (RNF-09)

1. **Minimização de dados pessoais em perfis profissionais (`PBI-05.1.1` / `S3-08`):**
   - `DevelopersService` (`backend/src/modules/developers/developers.service.ts`) bloqueia com `400 VALIDATION_ERROR` o cadastro ou edição de `nome` e `bio` contendo:
     - CPF, RG, CNH, título de eleitor ou passaporte;
     - Telefones e celulares;
     - Endereços residenciais e CEP;
     - Datas de nascimento ou idade;
     - Endereços de e-mail (pessoais, corporativos ou IDN) nos campos livres de resumo profissional.
   - Coberto por `developers.test.ts` e `developers.migration.db.test.ts`.
2. **Logs sem exposição de dados sensíveis (`rag.diagnostics.test.ts` e `chat.routes.ts`):**
   - Os logs de conclusão e erro (`[RAG] Request completed`, `[RAG] Request failed`, `[Chat Query Error]`, `[AI Harness] Request failed`, `[Seed]`) registram exclusivamente `diagnostico_id`, `etapa`, `codigo`, `duracao_ms` e contadores (`resultados_recuperados`, `fontes_utilizadas`), sem jamais imprimir perguntas do usuário, trechos de documentos, senhas, tokens JWT ou strings de conexão.

---

## 6. Acessibilidade e Operação Local/Offline (RNF-04)

1. **Acessibilidade (WCAG / ARIA / Teclado):**
   - Navegação por teclado (`Enter`, `Shift+Enter`, `Escape`, `Tab` trap em modais, `Shift+F10` em menus de contexto), `aria-live="polite"` para estados de processamento/streaming, `role="dialog"` / `role="alertdialog"` para confirmações de exclusão e fontes.
   - Zero overflow horizontal em viewport mobile (`390x640`) validado em `e2e/tests/mobile-navigation.e2e.mjs`.
2. **Operação 100% Local e Offline:**
   - Todos os componentes rodam localmente: `PostgreSQL 16 + pgvector` (`:55432`), `Backend Node.js` (`:3001`), `Frontend React/Nginx` (`:5173`), `AI Service FastAPI` (`:8000`) e `Ollama` (`:11434`) com `bge-m3` e `qwen2.5:1.5b` já carregados localmente.
   - Quando o serviço de IA fica indisponível, o CRUD de projetos/backlog, o motor determinístico de qualidade, a busca textual e as consultas determinísticas sobre a equipe continuam operando normalmente (`PBI-03.2.3`, `PBI-04.1.1 Cenário 3`).
