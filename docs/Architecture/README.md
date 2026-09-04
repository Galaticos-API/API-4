# Arquitetura e Diagramas do Sistema — Sinapse

> **PRO4TECH · Fatec São José dos Campos · Grupo Galáticos**  
> *Base Inteligente de Requisitos — Memória Institucional da Fábrica de Software*

Este documento consolida todos os diagramas arquiteturais, fluxos de execução e modelos de dados do **Sinapse**, servindo como referência visual e técnica central para a equipe de desenvolvimento e stakeholders, em conformidade com o [PRD](../PRD/PRD.md) e o [AGENTS.md](../AGENTS.md).

---

## 📑 Índice de Diagramas

1. [Visão Geral da Arquitetura e Ingestão](#1-visão-geral-da-arquitetura-e-ingestão)
2. [Fluxo de Consulta Semântica e RAG](#2-fluxo-de-consulta-semântica-e-rag)
3. [Diagrama Entidade-Relacionamento (ERD)](#3-diagrama-entidade-relacionamento-erd)
4. [Resumo das Fronteiras Arquiteturais](#4-resumo-das-fronteiras-arquiteturais)

---

## 1. Visão Geral da Arquitetura e Ingestão

Representa a divisão de responsabilidades entre as 6 camadas do ecossistema Sinapse:
- **Frontend (React SPA):** Interface do Product Owner.
- **Backend Aplicação (Node.js):** Ponto de entrada de negócio, autenticação, CRUD e validações determinísticas (RF-08 a RF-11). É o único serviço autorizado a persistir nas tabelas de negócio.
- **Serviço de IA (Python):** RAG Engine, chunking unificado (PRD 10.3) e Harness de alinhamento com o guia PRO4TECH.
- **Orquestração de Ingestão (n8n):** Monitoramento de arquivos em `/files`, gatilhos de eventos e workflows versionados via `n8n-local-sync`.
- **Banco de Dados Unificado (PostgreSQL):** Persistência relacional clássica combinada com a extensão `pgvector` (busca vetorial HNSW na tabela `chunk`).
- **Ollama:** Runtime de IA para inferência de LLM (Qwen 2.5 / Llama 3.1) e geração de embeddings locais (`bge-m3`).

### Diagrama Mermaid

```mermaid
flowchart TB
    subgraph Frontend["Frontend (React SPA)"]
        UI["Interface PO / Usuário"]
    end

    subgraph BackendApp["Backend Aplicação (Node.js)"]
        API["API REST / Auth / CRUD / Regras de Negócio"]
        Valida["Validação Estrutural (RF-08 a RF-11)"]
    end

    subgraph ServiceAI["Serviço de IA (Python)"]
        Harness["Harness (Guia PRO4TECH)"]
        RagEngine["RAG Engine & Embeddings"]
        LLM["LLM Aberto Local (ex: Llama / Mistral / Qwen)"]
    end

    subgraph Ingestao["Orquestração de Ingestão"]
        N8N["n8n (Workflows versionados via n8n-local-sync)"]
    end

    subgraph Database["Banco de Dados Unificado (PostgreSQL)"]
        Relational["Tabelas Relacionais (projeto, epico, pbi, etc.)"]
        VectorExt["Extensão pgvector (tabela chunk + índice HNSW)"]
    end

    UI -->|"Requisições HTTP"| API
    API -->|"Persistência e Leitura Relacional"| Relational
    API -->|"Delegação de IA / RAG"| ServiceAI
    N8N -->|"Dispara Ingestão de Documentos"| API
    N8N -->|"Envia arquivos para fragmentação"| RagEngine
    RagEngine -->|"Gera embeddings e consulta vetores"| VectorExt
    RagEngine -->|"Monta contexto enriquecido"| Harness
    Harness <--> LLM
```

<details>
<summary>🖼️ <b>Ver imagem estática renderizada</b></summary>

![Visão Geral da Arquitetura e Ingestão](Diagrams/Visão%20Geral%20da%20Arquitetura%20e%20Ingestão.jpg)

</details>

---

## 2. Fluxo de Consulta Semântica e RAG

Ilustra o ciclo de vida completo de uma pergunta realizada pelo Product Owner em linguagem natural (ex: *"Como tratamos concorrência no PIX?"*):

1. O **PO** envia a pergunta através da SPA em React.
2. O **Backend Node.js** recebe a requisição, autentica o usuário e valida o `projeto_id` para garantir o isolamento por metadados.
3. O **Serviço Python de IA** gera o embedding vetorial da query utilizando o modelo configurado no Ollama (`bge-m3`).
4. O Python executa a busca híbrida no **PostgreSQL com pgvector**, aplicando filtro estrito por `projeto_id` e ordenação por distância de cosseno (`<=>`).
5. Os top-5 chunks mais relevantes retornam do banco para o Python.
6. O Python injeta os chunks no prompt controlado do **Harness** (com regras para não alucinar e citar fontes obrigatoriamente).
7. O **LLM local** processa o contexto e gera a resposta estruturada com citações exatas.
8. A resposta com metadados de proveniência é enviada de volta ao Node.js e renderizada na interface do PO com links rastreáveis para os requisitos e documentos de origem.

### Diagrama de Sequência Mermaid

```mermaid
sequenceDiagram
    autonumber
    actor PO as Product Owner
    participant Web as React Frontend
    participant Node as Node.js Backend
    participant Py as Python IA Service
    participant PG as PostgreSQL + pgvector
    participant LLM as LLM Local (Ollama)

    PO->>Web: Pergunta: "Como tratamos concorrência no PIX?"
    Web->>Node: POST /api/chat/consulta (com projeto_id e pergunta)
    Node->>Py: POST /rag/retrieve (pergunta, projeto_id)
    Py->>Py: Gera embedding vetorial da pergunta
    Py->>PG: SELECT texto, fonte FROM chunk WHERE projeto_id = $1 ORDER BY embedding <=> $2 LIMIT 5
    PG-->>Py: Retorna top-5 chunks com maior similaridade
    Py->>LLM: Injeta chunks recuperados no prompt do Harness
    LLM-->>Py: Resposta estruturada com citação exata das fontes
    Py-->>Node: Retorna resposta + metadados de proveniência
    Node-->>Web: Exibe resposta com links para requisitos/documentos
```

<details>
<summary>🖼️ <b>Ver imagem estática renderizada</b></summary>

![Fluxo de Consulta Semântica (RAG)](Diagrams/Fluxo%20de%20Consulta%20Semântica%20(RAG).jpg)

</details>

---

## 3. Diagrama Entidade-Relacionamento (ERD)

Descreve a modelagem de dados relacional e vetorial unificada no PostgreSQL. 

### Destaques da Modelagem
- **Hierarquia de Requisitos:** `PROJETO` &rarr; `EPICO` &rarr; `FEATURE` &rarr; `PBI` &rarr; `CRITERIO_ACEITACAO`.
- **Rastreabilidade e Proveniência:** Critérios de aceitação com formato BDD (`dado`, `quando`, `entao`) e campos específicos para histórias de usuário (`historia_como_um`, `historia_eu_quero`, `historia_para_que`).
- **Isolamento de Conhecimento:** A tabela `CHUNK` armazena `projeto_id` desnormalizado para garantir que as buscas vetoriais não vazem informações entre projetos diferentes. A coluna `embedding` utiliza o tipo nativo `vector` do `pgvector`.
- **Mapeamento de Competências:** Relação `USUARIO` &rarr; `DESENVOLVEDOR` &rarr; `COMPETENCIA` &rarr; `TECNOLOGIA` para identificação de especialistas na equipe.

### Diagrama ERD Mermaid

```mermaid
erDiagram
    PROJETO ||--o{ EPICO : contem
    PROJETO ||--o{ DOCUMENTO : possui
    PROJETO ||--o{ CHUNK : escopo_isolamento
    PROJETO ||--o{ ALOCACAO : aloca

    EPICO ||--o{ FEATURE : divide
    FEATURE ||--o{ PBI : decompoe

    EPICO ||--o{ CRITERIO_ACEITACAO : possui
    FEATURE ||--o{ CRITERIO_ACEITACAO : possui
    PBI ||--o{ CRITERIO_ACEITACAO : possui

    PBI ||--o{ PROTOTIPO : anexa
    PBI ||--o{ PBI_RELACAO : relaciona

    USUARIO ||--o| DESENVOLVEDOR : perfil
    DESENVOLVEDOR ||--o{ COMPETENCIA : domina
    TECNOLOGIA ||--o{ COMPETENCIA : categoriza
    TECNOLOGIA ||--o{ ENTIDADE_TECNOLOGIA : taggeia

    USUARIO ||--o{ CONVERSA : cria
    CONVERSA ||--o{ MENSAGEM : contem

    DOCUMENTO ||--o{ CHUNK : fragmentado_em

    PROJETO {
        uuid id PK
        varchar nome
        varchar cliente
        text descricao
        varchar status
        timestamp data_inicio
    }

    EPICO {
        uuid id PK
        uuid projeto_id FK
        varchar titulo
        text objetivo
        text escopo_macro
        varchar prioridade
    }

    FEATURE {
        uuid id PK
        uuid epico_id FK
        varchar titulo
        text objetivo
        varchar prioridade
    }

    PBI {
        uuid id PK
        uuid feature_id FK
        varchar codigo
        varchar titulo
        text historia_como_um
        text historia_eu_quero
        text historia_para_que
        text regras_observacoes
        varchar tipo
        varchar prioridade
        int score_completude
    }

    CRITERIO_ACEITACAO {
        uuid id PK
        varchar entidade_tipo
        uuid entidade_id
        text texto
        text dado
        text quando
        text entao
    }

    DOCUMENTO {
        uuid id PK
        uuid projeto_id FK
        varchar nome
        varchar mime
        varchar caminho
        varchar status_processamento
    }

    CHUNK {
        uuid id PK
        uuid projeto_id FK "Desnormalizado para isolamento rapido"
        varchar entidade_tipo
        uuid entidade_id
        text texto
        jsonb metadados_json
        vector embedding "Coluna vetorial pgvector"
    }

    DESENVOLVEDOR {
        uuid id PK
        uuid usuario_id FK
        varchar senioridade
        text bio
    }

    COMPETENCIA {
        uuid id PK
        uuid desenvolvedor_id FK
        uuid tecnologia_id FK
        varchar nivel
        text evidencia
    }
```

<details>
<summary>🖼️ <b>Ver imagem estática renderizada</b></summary>

![Diagrama Entidade-Relacionamento (ERD)](Diagrams/Diagrama%20Entidade-Relacionamento%20(ERD).jpg)

</details>

---

## 4. Resumo das Fronteiras Arquiteturais

| Camada | Tecnologia | O que faz | O que NÃO faz |
|---|---|---|---|
| **Frontend** | React 19 / Vite / TS | Coleta entradas do PO, exibe acervo, renderiza chat e marca proveniência visualmente. | Não valida regras de negócio nem conversa direto com o banco ou Ollama. |
| **Backend** | Node.js 20+ / Express / TS | Autenticação, CRUD, validações determinísticas de conformidade (regex, termos vagos) e **única escrita nas tabelas de negócio**. | Não calcula embeddings nem executa RAG. |
| **Serviço de IA** | Python 3.11+ / FastAPI | **Fonte única da verdade para chunking**, gera embeddings, monta o contexto do Harness e consulta o LLM. | **Nunca grava diretamente nas tabelas de negócio** (devolve sugestões para confirmação humana). |
| **Ingestão** | n8n | Watch de pastas em `/files`, conversão de arquivos e gatilhos de disparo para `POST /ingest`. | Não define o tamanho dos chunks nem calcula vetores internamente. |
| **Banco** | PostgreSQL 16 + pgvector | Armazena dados relacionais estruturados e vetores de chunks indexados por HNSW. | Não expõe acesso direto para o cliente web. |
| **IA Local** | Ollama | Executa modelos de LLM e Embeddings localmente via API HTTP. | Não gerencia permissões de projeto ou regras de negócio da PRO4TECH. |
