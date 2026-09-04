-- ==============================================================================
-- SINAPSE - Script de Inicialização e Schema Inicial DDL (HT-02)
-- Compatível com PostgreSQL 16 + pgvector
-- ==============================================================================

-- 1. Extensões Essenciais
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Tabela: PROJETO
CREATE TABLE IF NOT EXISTS projeto (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    cliente VARCHAR(255) NOT NULL,
    descricao TEXT,
    status VARCHAR(50) DEFAULT 'em_andamento',
    data_inicio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela: EPICO
CREATE TABLE IF NOT EXISTS epico (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    projeto_id UUID NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
    titulo VARCHAR(255) NOT NULL,
    objetivo TEXT,
    escopo_macro TEXT,
    prioridade VARCHAR(50) DEFAULT 'Must',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabela: FEATURE
CREATE TABLE IF NOT EXISTS feature (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    epico_id UUID NOT NULL REFERENCES epico(id) ON DELETE CASCADE,
    titulo VARCHAR(255) NOT NULL,
    objetivo TEXT,
    prioridade VARCHAR(50) DEFAULT 'Must',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabela: PBI (Product Backlog Item / Requisito)
CREATE TABLE IF NOT EXISTS pbi (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feature_id UUID NOT NULL REFERENCES feature(id) ON DELETE CASCADE,
    codigo VARCHAR(50) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    historia_como_um TEXT NOT NULL,
    historia_eu_quero TEXT NOT NULL,
    historia_para_que TEXT NOT NULL,
    regras_observacoes TEXT,
    tipo VARCHAR(50) DEFAULT 'Funcional',
    prioridade VARCHAR(50) DEFAULT 'Must',
    score_completude INT DEFAULT 0,
    provenance VARCHAR(50) DEFAULT 'human-authored',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabela: CRITERIO_ACEITACAO (Formato BDD Dado/Quando/Então)
CREATE TABLE IF NOT EXISTS criterio_aceitacao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entidade_tipo VARCHAR(50) NOT NULL, -- 'pbi', 'feature', 'epico'
    entidade_id UUID NOT NULL,
    texto TEXT NOT NULL,
    dado TEXT,
    quando TEXT,
    entao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabela: PROTOTIPO
CREATE TABLE IF NOT EXISTS prototipo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pbi_id UUID NOT NULL REFERENCES pbi(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    tipo VARCHAR(50) DEFAULT 'figma',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tabela: PBI_RELACAO
CREATE TABLE IF NOT EXISTS pbi_relacao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pbi_origem_id UUID NOT NULL REFERENCES pbi(id) ON DELETE CASCADE,
    pbi_destino_id UUID NOT NULL REFERENCES pbi(id) ON DELETE CASCADE,
    tipo_relacao VARCHAR(50) NOT NULL, -- 'bloqueia', 'depende_de', 'relacionado'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Tabela: DOCUMENTO
CREATE TABLE IF NOT EXISTS documento (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    projeto_id UUID NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    mime VARCHAR(100),
    caminho VARCHAR(500) NOT NULL,
    status_processamento VARCHAR(50) DEFAULT 'pendente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Tabela: CHUNK (Armazenamento de Trechos e Vetores do RAG)
CREATE TABLE IF NOT EXISTS chunk (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    projeto_id UUID NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
    entidade_tipo VARCHAR(50) NOT NULL, -- 'pbi', 'documento', 'decisao', 'feature', 'epico'
    entidade_id UUID NOT NULL,
    texto TEXT NOT NULL,
    metadados_json JSONB DEFAULT '{}'::jsonb,
    embedding vector(1024), -- Dimensão compatível com BAAI/bge-m3
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Tabela: USUARIO
CREATE TABLE IF NOT EXISTS usuario (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'po', -- 'po', 'admin', 'dev'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. Tabela: DESENVOLVEDOR (Perfil estendido do usuário)
CREATE TABLE IF NOT EXISTS desenvolvedor (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    senioridade VARCHAR(50),
    bio TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Tabela: TECNOLOGIA
CREATE TABLE IF NOT EXISTS tecnologia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(100) UNIQUE NOT NULL,
    categoria VARCHAR(50), -- 'frontend', 'backend', 'database', 'ai', 'cloud', 'devops'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. Tabela: COMPETENCIA
CREATE TABLE IF NOT EXISTS competencia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    desenvolvedor_id UUID NOT NULL REFERENCES desenvolvedor(id) ON DELETE CASCADE,
    tecnologia_id UUID NOT NULL REFERENCES tecnologia(id) ON DELETE CASCADE,
    nivel VARCHAR(50) DEFAULT 'intermediario', -- 'iniciante', 'intermediario', 'avancado', 'especialista'
    evidencia TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 15. Tabela: ENTIDADE_TECNOLOGIA (Tag de tecnologias em requisitos/projetos)
CREATE TABLE IF NOT EXISTS entidade_tecnologia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entidade_tipo VARCHAR(50) NOT NULL,
    entidade_id UUID NOT NULL,
    tecnologia_id UUID NOT NULL REFERENCES tecnologia(id) ON DELETE CASCADE
);

-- 16. Tabela: ALOCACAO
CREATE TABLE IF NOT EXISTS alocacao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    desenvolvedor_id UUID NOT NULL REFERENCES desenvolvedor(id) ON DELETE CASCADE,
    projeto_id UUID NOT NULL REFERENCES projeto(id) ON DELETE CASCADE,
    papel VARCHAR(100),
    data_inicio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_fim TIMESTAMP WITH TIME ZONE
);

-- 17. Tabela: CONVERSA
CREATE TABLE IF NOT EXISTS conversa (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    projeto_id UUID REFERENCES projeto(id) ON DELETE SET NULL,
    titulo VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 18. Tabela: MENSAGEM
CREATE TABLE IF NOT EXISTS mensagem (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversa_id UUID NOT NULL REFERENCES conversa(id) ON DELETE CASCADE,
    remetente VARCHAR(50) NOT NULL, -- 'user', 'assistant', 'system'
    conteudo TEXT NOT NULL,
    fontes_json JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices de Otimização e Busca Vetorial
CREATE INDEX IF NOT EXISTS idx_chunk_projeto_id ON chunk(projeto_id);
CREATE INDEX IF NOT EXISTS idx_chunk_entidade ON chunk(entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS idx_pbi_codigo ON pbi(codigo);
CREATE INDEX IF NOT EXISTS idx_pbi_feature ON pbi(feature_id);
CREATE INDEX IF NOT EXISTS idx_criterio_entidade ON criterio_aceitacao(entidade_tipo, entidade_id);

-- Índice HNSW no pgvector para busca por similaridade de cosseno ultrarrápida
CREATE INDEX IF NOT EXISTS idx_chunk_embedding ON chunk USING hnsw (embedding vector_cosine_ops);
