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
        uuid projeto_id FK "Desnormalizado para isolamento rápido"
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
