sequenceDiagram
    autonumber
    actor PO as Product Owner
    participant Web as React Frontend
    participant Node as Node.js Backend
    participant Py as Python IA Service
    participant PG as PostgreSQL + pgvector
    participant LLM as LLM Local

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
