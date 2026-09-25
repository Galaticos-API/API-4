---
id: PRO4TECH-SINAPSE-AGENT-CONTEXT
type: AI_AGENT_CONTEXT
project: "Sinapse"
project_aliases:
  - "Memória da Fábrica de Software"
  - "Base Inteligente de Requisitos"
status: "authoritative-context"
repository: "Galaticos-API/API-4"
source_documents:
  - "docs/PRD-PRO4TECH.md"
  - "docs/Architecture/README.md"
  - "docs/PLANEJAMENTO_SCRUM.md"
  - "docs/backlog/README.md"
  - "docs/api/openapi.yaml"
read_first: true
purpose: "This file is the single canonical context for AI agents working on this project. It contains total domain, architecture, schema, requirements, design system, and operational rules."
---

# AGENT CANONICAL CONTEXT: PRO4TECH / SINAPSE

## 1. EXECUTIVE SUMMARY & PRODUCT VISION

**Project Goal:**
Build a platform that converts software requirements into a reusable, intelligent institutional memory for the software factory (PRO4TECH). The system helps Product Owners (POs) specify features with standard quality, lower rework, and zero knowledge loss between teams and projects.

**Core Product Essence:**
- **Hierarchical Backlog:** `Projeto` $\rightarrow$ `Épico` $\rightarrow$ `Feature` $\rightarrow$ `PBI` $\rightarrow$ `Critério de Aceitação (BDD)`.
- **Assistive AI:** AI acts strictly as an assistant/copilot (questioning, suggesting, standardizing), **never** as an autonomous persistent author.
- **Three Knowledge Axes:**
  1. **Projects** (Requirements, decisions, documents, history)
  2. **People** (Developers, roles, seniorities, project allocations)
  3. **Technologies / Stacks** (Frameworks, libraries, integrations, competencies)
- **Knowledge Retrieval:** Semantic/text hybrid search, natural language Q&A chat with mandatory source citations, and team competence matching.

---

## 2. CLIENT & DOMAIN CONTEXT

- **Client:** PRO4TECH — Digital Tech Transformation (Software factory & digital transformation partner).
- **Operating Model:** Scrum, squads, DevOps pipelines, multi-model contracts (build, support, build+support).
- **Stakeholders:** 4 Product Owners.
- **Domain Problem:**
  - POs document requirements inconsistently across different channels.
  - Critical technical decisions are lost in chat histories or individual memory.
  - Solutions built in past projects are forgotten and reimplemented from scratch.
  - Onboarding new squad members to legacy projects takes excessive time.
  - Tracing *what* was decided and *why* is costly.
- **Core Value Proposition:**
  Transform learned project knowledge into searchable, reusable institutional memory.

---

## 3. NON-NEGOTIABLE PRODUCT & ARCHITECTURAL PRINCIPLES

### 3.1. AI Governance Rules (RNF-01, RNF-02)
1. **Assistive Only:** AI **never** writes directly to business database tables.
2. **Explicit Human Action Required:** Every AI output is a draft/suggestion. The PO must explicitly **accept, edit, or discard** suggestions.
3. **Provenance Tracking:** Every requirement field must record its origin (`human-authored`, `ai-accepted`, `ai-edited`).
4. **Zero Hallucinations:** Chat and RAG responses must only answer based on retrieved evidence and **must cite source documents/PBIs**. If no evidence is found, return *"Informação não encontrada no acervo do projeto."*
5. **Primary AI Behavior:** AI should prioritize **questioning** (identifying gaps, edge cases, missing non-functionals) rather than merely drafting text.

### 3.2. Scope Boundaries (System vs. Azure DevOps)
- **This Product IS NOT a Project Management Tool.**
- **Azure DevOps** remains the single source of truth for sprint execution, Kanban boards, hour tracking, task assignments, and burndown charts.
- **Sinapse IS Responsible For:** Requirements specification, quality scoring, technical decisions rationale, document acervo, team competencies, and reusable knowledge.

### 3.3. Security & Data Isolation Principles
- **Project Isolation (RNF-03):** Vector RAG queries **must** enforce metadata filtering by `project_id`. Semantic vector closeness across projects does **not** grant project membership.
- **100% Local & Offline Stack (RNF-03, RNF-04):** Core LLM inference (`qwen2.5:1.5b`) and embeddings (`bge-m3`) run 100% locally via Ollama with zero external cloud dependencies.
- **LGPD Awareness (RNF-09):** Developer competence and allocation data must handle professional information transparently with role-based access control.

---

## 4. USER PERSONAS & ROLES

1. **Product Owner (PO - Primary Persona):**
   - *Needs:* Copilot that standardizes specifications, flags vague terms, asks clarifying questions, and suggests similar past features for reuse.
2. **Developer / Tech Lead:**
   - *Needs:* Unambiguous, testable BDD acceptance criteria, decision rationales, and fast technical onboarding.
3. **Delivery Manager / Head of Delivery:**
   - *Needs:* Mapped team technical competencies to form optimal squads based on stack experience.
4. **New Squad Member:**
   - *Needs:* Conversational Q&A chat to query historical project decisions and architecture without disturbing senior devs.

---

## 5. SYSTEM ARCHITECTURE & TOPOLOGY

The application is structured into conteinerized, local microservices:

```text
                                  +-----------------------+
                                  |  Frontend (React 19)  |
                                  |  Port 5173 (Vite SPA) |
                                  +-----------+-----------+
                                              | HTTP REST / Auth JWT
                                              v
+------------------+  n8n Sync   +-----------------------+  SQL / pgvector  +-----------------------+
|  n8n Orquestra-  |<----------->|  Backend (Node 20/TS) |<---------------->| PostgreSQL 16 +       |
|  dor (Port 5678) |             |  Port 3001 (Express)  |                  | pgvector (Port 55432) |
+------------------+             +-----------+-----------+                  +-----------------------+
                                              | HTTP REST / Internal
                                              v
                                 +-------------------------+  Ollama API   +-----------------------+
                                 |  Serviço IA (Python 3.11|-------------->| Ollama Runtime (Local)|
                                 |  FastAPI - Port 8000)   |               | Port 11434 (bge-m3)   |
                                 +-------------------------+               +-----------------------+
```

### Topology & Ports Summary:

| Component | Stack | Local Port | Main Responsibility |
|---|---|:---:|---|
| **Database** | PostgreSQL 16 + `pgvector` | `55432` (host) | Relational persistence & vector embeddings (`vector_cosine_ops`, HNSW index). |
| **Backend** | Node.js 20+ / Express / TS | `3001` | REST API, Auth JWT, CRUD, deterministic quality engine, **sole persistent writer to business tables**. |
| **Frontend** | React 19 / Vite / TS | `5173` | SPA for POs (requirements hierarchy, quality indicators, acervo search, chat). |
| **AI Service** | Python 3.11+ / FastAPI | `8000` | Chunking source of truth, RAG retrieval, `bge-m3` embedding calculation, PRO4TECH Harness. |
| **n8n** | n8n `latest` | `5678` | Asynchronous file ingestion workflow (`/files`), GitOps versioned via `n8n-local-sync`. |
| **Ollama** | Ollama Container | `11434` | Local LLM (`qwen2.5:1.5b`) and Embedding (`bge-m3`) runtime. |

---

## 6. DOMAIN MODEL & DATABASE SCHEMA

### 6.1. Entity Hierarchy
`PROJETO` $\rightarrow$ `EPICO` $\rightarrow$ `FEATURE` $\rightarrow$ `PBI` $\rightarrow$ `CRITERIO_ACEITACAO`.

### 6.2. PostgreSQL Schema Highlights (`database/init.sql` & Migrations)

- **`projeto`**: `id` (UUID), `nome`, `cliente`, `descricao`, `status` (`ativo`, `em_andamento`, `concluido`, `arquivado`), `created_at`.
- **`epico`**: `id` (UUID), `projeto_id` (FK), `titulo`, `objetivo`, `escopo_macro`, `prioridade` (`Must`, `Should`, `Could`, `Won't`), `status` (`rascunho`, `pronto`, `concluido`, `arquivado`).
- **`feature`**: `id` (UUID), `epico_id` (FK), `titulo`, `objetivo`, `prioridade`, `status`.
- **`pbi`**: `id` (UUID), `feature_id` (FK), `codigo` (unique, ex: `PBI-01.1.1`), `titulo` (verb in infinitive), `historia_como_um`, `historia_eu_quero`, `historia_para_que`, `regras_observacoes`, `tipo` (`Funcional`, `Nao-Funcional`), `prioridade`, `score_completude` (0-100), `provenance` (`human-authored`, `ai-accepted`, `ai-edited`), `requer_interface` (boolean), `status`.
- **`criterio_aceitacao`**: `id` (UUID), `entidade_tipo` (`epico`, `feature`, `pbi`), `entidade_id` (UUID), `ordem`, `texto`, `dado` (BDD Given), `quando` (BDD When), `entao` (BDD Then).
- **`documento`**: `id` (UUID), `projeto_id` (FK), `nome`, `mime`, `caminho`, `status_processamento`.
- **`chunk`**: `id` (UUID), `projeto_id` (FK desnormalizado), `entidade_tipo`, `entidade_id`, `texto`, `metadados_json` (JSONB), `embedding` (`vector(1024)` indexed with HNSW `vector_cosine_ops`).
- **`usuario` / `desenvolvedor` / `competencia` / `tecnologia`**: Team competence graph (`senioridade`, `bio`, `nivel`, `evidencia`).
- **`organizacao_configuracao`**: Versioned quality organizational policy rules.

---

## 7. REQUIREMENTS QUALITY & COMPLETENESS SCORING ENGINE

The completeness score ($0 \text{ to } 100\%$) for a PBI is computed deterministically by the backend (`GET /api/v1/quality/configuration/pbi`):

$$\text{Score} = \left( \frac{\text{Verificações Aprovadas}}{\text{Verificações Aplicáveis}} \right) \times 100$$

### PBI Quality Verifications:
1. **Title Format:** Must start with an infinitive verb (e.g., *Cadastrar*, *Consultar*, *Validar*).
2. **User Story Completeness:** Must contain non-empty `COMO UM`, `EU QUERO`, and `PARA QUE` fields.
3. **Acceptance Criteria (BDD):** Must have at least 1 BDD scenario with non-empty `DADO`, `QUANDO`, `ENTÃO`.
4. **Vague Terms Dictionary:** Must not contain vague/ambiguous terms (e.g., *fácil*, *rápido*, *amigável*, *adequado*, *se possível*).
5. **Prototype Link (`prototipo_vinculado`):** Evaluated **only** when `requer_interface = true`. Checks if a record exists in `prototipo` table for the PBI. If `requer_interface = false`, this rule is marked non-applicable and omitted from the denominator.

---

## 8. RAG ENGINE, INGESTION & EMBEDDING PIPELINE

### 8.1. Embedding Model Decision (Spike PRE-07)
- **Selected Model:** **`BAAI/bge-m3`** via Ollama.
- **Vector Dimension:** **1024** (100% matched to `chunk.embedding vector(1024)` in Postgres `pgvector`).
- **Context Window:** 8,192 tokens.
- **PT-BR Benchmark:** 100% Top-1 accuracy with **+0.81** margin over distractor noise.

### 8.2. RAG Ingestion & Query Flow
1. **Ingestion:** Document upload $\rightarrow$ n8n watcher $\rightarrow$ `POST /ingest` (Python `ai-service`) $\rightarrow$ Chunking (paragraph boundary aware) $\rightarrow$ Calculate 1024d embedding via `bge-m3` $\rightarrow$ Store in Postgres `chunk` table with `projeto_id` metadata.
2. **Retrieval:** Query $\rightarrow$ `bge-m3` vector $\rightarrow$ Hybrid search in Postgres (HNSW Cosine Similarity `embedding <=> query_vec` + SQL Full-Text Search `tsvector`) with mandatory `WHERE projeto_id = $1` $\rightarrow$ Top-5 chunks.
3. **Synthesis:** Top-5 chunks injected into Python PRO4TECH Harness prompt $\rightarrow$ Local LLM (`qwen2.5:1.5b`) $\rightarrow$ Response with explicit source citations.

---

## 9. EVOLUTIONARY ARCHITECTURE: GRAPHRAG

GraphRAG combines vector search with relational knowledge graph expansion:

```sql
-- Knowledge Graph Tables in PostgreSQL
CREATE TABLE knowledge_entity (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL, -- TECHNOLOGY, PERSON, PROJECT, DECISION
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL
);

CREATE TABLE knowledge_relation (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
    source_entity_id UUID NOT NULL REFERENCES knowledge_entity(id),
    relation_type VARCHAR(80) NOT NULL, -- USES, WORKED_ON, DEPENDS_ON, JUSTIFIES
    target_entity_id UUID NOT NULL REFERENCES knowledge_entity(id),
    source_chunk_id UUID REFERENCES chunk(id),
    confidence REAL
);
```

**Traversal Rule:** `project_id` scoping is enforced prior to graph traversal (depth 1-2 hops max) to answer complex multi-hop queries (e.g., *"Who worked on PIX integration and what architectural decisions were made?"*).

---

## 10. FRONTEND DESIGN SYSTEM & UI TOKENS

The frontend React application follows a dark-mode palette extracted from PRO4TECH guidelines:

### Design Tokens (`frontend/src/index.css` & `tailwind.config.js`):
- **Background (`surface-base`):** `#0A0D14` (Dark Blue/Black)
- **Primary Brand (`brand-primary`):** `#F97316` (Vibrant Orange CTA, borders, highlights)
- **Text Primary (`text-primary`):** `#FFFFFF`
- **Text Secondary (`text-secondary`):** `#9CA3AF`
- **Stepper Colors (`step-1` to `step-5`):**
  - Step 1 (Descobrimos): `#F28C68`
  - Step 2 (Projetamos): `#D97354`
  - Step 3 (Construímos): `#BD5A40`
  - Step 4 (Implantamos): `#944230`
  - Step 5 (Evoluímos): `#6E2D22`
- **Typography:** `Inter`, system-ui, sans-serif.
- **Border Radius:** `radius-full` (`9999px`) for pill buttons/badges, `radius-md` (`8px`) for cards.

---

## 11. DEV SETUP & OPERATIONS COMMANDS

### Environment Setup:
```bash
# 1. Environment variables
cp .env.example .env

# 2. Start core docker services
docker compose up -d

# 3. Pull Ollama models (optional)
docker compose --profile local-ai up -d
docker compose --profile local-ai exec ollama ollama pull bge-m3
docker compose --profile local-ai exec ollama ollama pull qwen2.5:1.5b
```

### Verification & Testing Commands:

| Verification | Command | Location |
|---|---|---|
| **Backend Migrations** | `npm run migrate` | `backend/` |
| **Backend Unit/Int Tests** | `npm test` | `backend/` |
| **Backend Integrated S1** | `npm run test:integration:s1` | `backend/` |
| **Backend Typecheck** | `npm run typecheck` | `backend/` |
| **Backend Security Audit** | `npm run audit:security` | `backend/` |
| **Frontend Tests** | `npm test` | `frontend/` |
| **Frontend Production Build** | `npm run build` | `frontend/` |
| **AI Service Tests** | `python -m unittest discover -s tests` | `ai-service/` |
| **n8n Workflow Sync** | `n8n-sync validate` | Root |

---

## 12. CURRENT CODEBASE STATE & BINDING AGENT RULES

1. **Active Sprint State:**
   - Auth JWT (login, logout, session restoration `/auth/me`, role guards `admin`, `po`, `dev`) is fully operational.
   - Requirements hierarchy CRUD (Project, Epic, Feature, PBI, Acceptance Criteria) is complete.
   - Archival cascading (`PATCH /archive`) with transaction locks and impact previews is active.
   - Quality configuration endpoints and score calculation are live.
   - Backward compatibility routes are maintained in `backend/src/modules/epics/epics.compat.routes.ts`.

2. **Binding Rules for AI Agents:**
   - **Never guess API contracts or DB schemas.** Read `database/init.sql` and `docs/api/openapi.yaml`.
   - **Preserve legacy compatibility adapters** when updating backend endpoints.
   - **Enforce Node.js as the sole persistent writer.** Python AI service sends suggestions; Node backend validates and writes.
   - **Enforce project isolation in all RAG / DB queries** via `WHERE project_id = $1`.
   - **Always run verification commands** (`npm test`, `npm run typecheck`) after editing code.
