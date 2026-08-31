---
id: PRO4TECH-SINAPSE-AGENT-CONTEXT
:type: AI_AGENT_CONTEXT
project: "Sinapse"
project_aliases:
  - "Memória da Fábrica de Software"
  - "Base Inteligente de Requisitos"
status: "draft-authoritative-context"
repo_scope: "docs-only-initial-state"
repository: "r:/FATEC/sem4/API-4"
source_documents:
  - "docs/Kick-off.md"
  - "docs/PRD.md"
  - "docs/PRD-PRO4TECH.md"
read_first: true
purpose: "This file is the canonical context for AI agents working on this project. It is not intended for end users."
---

# AGENT CONTEXT: PRO4TECH / SINAPSE

## 1. EXECUTIVE SUMMARY

Project goal:
- Build a platform that converts software requirements into a reusable, intelligent knowledge base.
- The system must help Product Owners specify features with less rework and less knowledge loss.
- The platform is not a project management tool; it is a memory layer for the software factory.

Product essence:
- Project -> Epic -> Feature -> Requirement
- AI acts as an assistant, not an autonomous author.
- Every requirement and decision is stored as reusable knowledge.
- Knowledge is retrievable through semantic/text search and conversational Q&A.
- Team knowledge is also tracked: who knows what, with which technologies, in what contexts.

Core value:
- Prevent loss of tacit knowledge between projects, Product Owners, and developers.
- Standardize requirement quality.
- Reuse historical learnings instead of starting from zero each time.

## 2. CLIENT / PARTNER

- Company: PRO4TECH — Digital Tech Transformation
- Business model: software factory / digital transformation partner
- Operating model: Scrum, squads, DevOps pipeline
- Services: mobile apps, AI, BI, RPA, IoT, productivity solutions
- Contract models: build, support, build+support
- Main stakeholders: 4 Product Owners

## 3. DOMAIN PROBLEM

Current pain:
- Each Product Owner documents requirements differently.
- Critical information is fragmented across documents, conversations, and projects.
- Past solutions are not always remembered.
- Knowledge is tied to individuals and is not transferred across the team.
- Tracing "what was decided and why" is expensive and slow.
- New team members take too long to understand legacy context.

Problem statement:
- The issue is not merely requirement documentation.
- The primary problem is transforming learned project knowledge into reusable and searchable institutional memory.

## 4. PRODUCT VISION

The system should allow Product Owners to:
- create projects, epics, features, and requirements
- use AI to ask clarifying questions and identify missing info
- standardize requirement structure and quality
- search historical requirements and decisions semantically
- ask natural-language questions about the organization’s knowledge base
- leverage team competence data to identify experts and fit people to work

Three knowledge axes:
- Projects
- People
- Technologies / stacks

Crossing these axes yields answers such as:
- who worked on this before
- what was done in a similar feature
- which tech stack was used
- which people have experience with a given integration or domain

## 5. NON-NEGOTIABLE PRODUCT PRINCIPLES

AI rules:
- AI does not write requirements autonomously.
- AI is assistive, not authoritative.
- Every AI output is a suggestion, never an automatic save.
- Human action is required: accept, edit, or discard.
- Provenance must be tracked: human-authored, AI accepted, AI edited.
- Primary AI behavior should be questioning, not drafting.

Scope boundary:
- This product is not a project management system.
- Azure DevOps remains the place for sprint, task, kanban, hours, and burndown management.

This system is responsible for:
- requirements
- decisions
- competencies
- project history
- reusable knowledge

This system is not responsible for:
- sprint planning
- backlog execution tracking
- task management
- hours management
- burndown

## 6. USERS AND PERSONAS

Primary persona:
- Product Owner
- Pain: starts from scratch every time; forgets missing questions; loses context; cannot easily reuse previous work.
- Needs: a copilot that questions, standardizes, and recalls the past.

Secondary personas:
- Developer / Tech Lead
- Needs: clearer, more testable requirements and rationales.

- Delivery Manager / Head of Delivery
- Needs: team competence and historical fit mapping.

- New team member
- Needs: fast onboarding via conversational access to project knowledge.

## 7. CORE PRODUCT CAPABILITIES

### 7.1 Requirement lifecycle
- Project -> Epic -> Feature -> Requirement -> Acceptance criteria
- Requirements must use a standard template with fields for:
  - code
  - title
  - type
  - description
  - actor
  - acceptance criteria (Gherkin)
  - business rules
  - priority (MoSCoW)
  - technologies/integrations
  - dependencies
  - decisions and rationale
  - status
  - provenance
  - version/history

### 7.2 Completion scoring
- Each requirement should be assigned a completeness score from 0 to 100.
- Score is computed from filled fields and heuristics.
- AI can flag ambiguity, missing edge cases, or non-testable criteria.

### 7.3 AI-assisted requirement capture
Must support:
- questioner mode: ask about gaps, ambiguities, uncovered cases
- standardizer mode: rewrite the PO text into the project template
- memory mode: suggest similar prior requirements while the PO writes
- acceptance criteria generation from requirement descriptions
- human approval before persistence

### 7.4 Knowledge ingestion and retrieval
- Upload documents (PDF, DOCX, MD, TXT) tied to a project
- Extract text, chunk content, generate embeddings, index it
- Enforce project-level isolation in retrieval
- Support hybrid search: semantic + keyword
- Provide citations and source links in answers
- Return “no evidence found” when the knowledge base does not support the claim

### 7.5 Team knowledge graph
- Register developers with profile, seniority, bio
- Record technical competencies by technology with level and evidence
- Track allocations to projects/features with role and period
- Build historical knowledge from work patterns and requirements touched
- Support queries like “who has worked with PIX integration?”
- Recommend people with affinity for new features

## 8. FUNCTIONAL REQUIREMENTS SUMMARY

Must-have priorities:
- RF-01 to RF-03: manage projects, epics, features
- RF-05 to RF-10: structured requirements and traceability
- RF-12 to RF-19: AI assistance with explicit approval flow
- RF-20 to RF-23: project-bound document ingestion and isolation
- RF-27 to RF-37: knowledge base search, indexing, and chat
- RF-38 to RF-43: developer competence and team knowledge
- RF-47 to RF-49: auth and access control

Conditional / future high-value features:
- RF-44: suggest tech stack for new project based on similar historical contexts
- RF-45: suggest squad composition
- RF-46: estimate effort based on previous similar work
- RF-25: ingest meeting transcripts as project context
- RF-26: register Git board/repository metadata

## 9. NON-FUNCTIONAL REQUIREMENTS

Hard constraints:
- RNF-01: AI must be assistive; no automatic persistent writes without human confirmation
- RNF-02: chat must not hallucinate; it must only answer based on retrieved evidence and cite sources
- RNF-03: 100% local/offline AI stack, no cloud dependency for core system behavior
- RNF-04: open-source-first toolchain
- RNF-05: optimized for Brazilian Portuguese
- RNF-06: search under 2s; first chat response under 5s
- RNF-08: provenance, authorship, date, version history
- RNF-09: LGPD-aware handling of professional competence data
- RNF-10: containerized local deployment with one-command startup
- RNF-11: GitHub + CI + automated tests on PRs
- RNF-12: documented API and installation flow

## 10. ARCHITECTURE

### 10.1 Technology stack
- Frontend: React
- Backend: Node.js
- AI orchestration: Python
- Relational database: PostgreSQL
- Vector database: pgvector preferred; ChromaDB as fallback
- Ingestion pipeline: n8n
- LLM: local open model
- Versioning / CI: GitHub

### 10.2 Runtime separation
Node.js responsibilities:
- app logic
- auth
- CRUD
- permissions
- validation
- versioning
- persistence in business tables

Python responsibilities:
- embeddings generation
- search/retrieval
- RAG context assembly
- AI harness logic
- LLM interactions

Critical architectural rule:
- The AI service must not write directly to the business database.
- It sends suggestions and structured output; the application layer persists only after human approval.

### 10.3 RAG pipeline
Ingestion flow:
1. Document upload or entity change triggers indexing
2. Extract text
3. Chunk into passages
4. Attach metadata: project_id, feature_id, type, technologies, status, date
5. Generate embedding
6. Store in vector index

Query flow:
1. User query is embedded
2. Metadata filter is mandatory (project scoping)
3. Hybrid search: semantic + full-text
4. Top-K chunks compose context
5. LLM answers only from this context
6. If no evidence, respond: "I did not find this in the base"

Important technical correction:
- Project isolation must be enforced using metadata filters, not vector proximity.
- Similar concepts from different projects may be semantically close, and proximity is not project membership.

## 11. DOMAIN MODEL

Core hierarchy:
- Project
  - Epic
    - Feature
      - Requirement
        - Acceptance criterion

Relationships:
- Project has many documents
- Developer can be attached to projects/features via allocation
- Developer has many competencies
- Decision can be attached to project, epic, feature, or requirement
- Requirements can relate to each other via dependencies and similarity links

Metadata model requirement:
- Every content unit can be chunked and embedded
- Embeddings must be linked to provenance, project, feature, type, and tags

## 12. DATA / DOCUMENT MODEL

Standard requirement schema:
- code
- title
- type
- description
- actor
- acceptanceCriteria
- businessRules
- priority
- technologiesIntegrations
- dependencies
- decisionsAndRationale
- status
- provenance
- versionHistory

Provenance model:
- human-authored
- AI-suggested and accepted
- AI-suggested and edited

Versioning requirement:
- all changes to a requirement are versioned and reviewable

## 13. PROJECT OBJECTIVE IN ONE LINE

Create the memory system of the software factory: a platform that stores, standardizes, searches, and reuses project knowledge so Product Owners can specify better software with less repetition and fewer lost decisions.

## 14. SUCCESS METRICS

- O1: 90%+ of requirements with all required fields filled
- O2: measurable reduction in time to specify a feature
- O3: 30%+ of created requirements derived from historical reuse
- O4: 80%+ of 20 test questions answered with correct source citation
- O5: 80%+ of competence/role queries answered correctly
- O6: onboarding validation through chat-only answers about unfamiliar projects

## 15. EXPLICIT SCOPE EXCLUSIONS

Out of scope for this phase:
- sprint management
- kanban
- hours tracking
- task management
- burndown
- code generation from requirements
- bidirectional Azure DevOps/Jira/Git integrations
- native mobile app
- multi-tenant client-level isolation

## 16. OPEN QUESTIONS / DECISIONS TO CONFIRM

- exact document templates from PRO4TECH must still be integrated
- final taxonomy for epic/feature/backlog hierarchy
- final approval flow for AI suggestions and editing history
- whether transcription ingestion is in scope for this release
- whether tech stack recommendations and effort estimation belong to this phase

## 17. IMPLEMENTATION GUIDANCE FOR AGENTS

When generating or modifying code for this project, treat the following as binding rules:

1. Respect the product boundary:
   - this is a knowledge system, not a project manager

2. Respect AI governance:
   - AI must assist, never automatically persist
   - provenance is required
   - no hallucinated answers in chat
   - source citations are mandatory

3. Respect data isolation:
   - project-scoped retrieval must be enforced by metadata filters
   - do not rely on embedding closeness as project membership

4. Respect local-first architecture:
   - prefer open-source local tools
   - avoid cloud-only dependencies unless explicitly approved

5. Respect Portuguese-first UX:
   - prioritize Brazilian Portuguese terminology and interactions

6. Respect the requirement model:
   - keep requirement structure standardized and traceable
   - capture both functional content and the reason for decisions

7. Respect the knowledge graph principle:
   - metadata about people, projects, technologies, and decisions matters as much as requirement text

## 18. AGENT READY STATE

This file is the canonical entry point for AI-driven work on this project.
The repository at this moment appears to be in a planning/documentation phase, so documentation is the source of truth.
Any implementation work should be grounded here before adding code, schema, or architecture changes.
