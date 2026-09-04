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
