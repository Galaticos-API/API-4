-- SINAPSE - Carga Completa de Dados de Demonstração e Acervo
-- Popula todo o ecossistema: Projetos, Épicos, Features, PBIs, Critérios BDD,
-- Tecnologias, Competências, Decisões Arquiteturais, Relações entre PBIs,
-- Protótipos, Documentos, Chunks de Acervo e Análises de Repositório.

BEGIN;

-- 1. Usuários Base (Administrador, PO e Desenvolvedor)
-- Senha padrão para os usuários de teste: Admin@123
INSERT INTO usuario (id, nome, email, senha_hash, role)
VALUES 
  ('10000000-0000-4000-8000-000000000001', 'Admin Sinapse', 'admin@sinapse.local', '0e78c85775c74291be1a14fbf4cb2c48:16384:8:1:a595cb2ff6b17c91d8e12ec68593aef4c76b0098dfc6fcf4a3a60a77e5d8ec1d0f508a6b3337f7c46fcf8bfba369ea396a5d46be73715e7fc24cb1c3d1822791', 'admin'),
  ('10000000-0000-4000-8000-000000000002', 'PO Daniel Dias', 'po@sinapse.local', '0e78c85775c74291be1a14fbf4cb2c48:16384:8:1:a595cb2ff6b17c91d8e12ec68593aef4c76b0098dfc6fcf4a3a60a77e5d8ec1d0f508a6b3337f7c46fcf8bfba369ea396a5d46be73715e7fc24cb1c3d1822791', 'po'),
  ('10000000-0000-4000-8000-000000000003', 'Dev Rafael Matesco', 'dev@sinapse.local', '0e78c85775c74291be1a14fbf4cb2c48:16384:8:1:a595cb2ff6b17c91d8e12ec68593aef4c76b0098dfc6fcf4a3a60a77e5d8ec1d0f508a6b3337f7c46fcf8bfba369ea396a5d46be73715e7fc24cb1c3d1822791', 'dev')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;

-- 2. Tecnologias do Ecossistema
INSERT INTO tecnologia (id, nome, categoria)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'TypeScript', 'backend'),
  ('20000000-0000-4000-8000-000000000002', 'React 19', 'frontend'),
  ('20000000-0000-4000-8000-000000000003', 'PostgreSQL', 'database'),
  ('20000000-0000-4000-8000-000000000004', 'pgvector', 'ai'),
  ('20000000-0000-4000-8000-000000000005', 'Python FastAPI', 'backend'),
  ('20000000-0000-4000-8000-000000000006', 'Ollama / Qwen2.5', 'ai'),
  ('20000000-0000-4000-8000-000000000007', 'Docker', 'devops'),
  ('20000000-0000-4000-8000-000000000008', 'Vite', 'frontend')
ON CONFLICT (nome) DO NOTHING;

-- 3. Desenvolvedores e Competências
INSERT INTO desenvolvedor (id, usuario_id, senioridade, bio)
VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'Senior', 'Engenheiro de Software com foco em microsserviços Node.js, arquitetura de dados e IA generativa.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO competencia (id, desenvolvedor_id, tecnologia_id, nivel, evidencia)
VALUES
  ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'especialista', 'Implementação da suíte de backend e barramento de eventos'),
  ('31000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'avancado', 'Modelagem relacional e vetorial com PostgreSQL e pgvector'),
  ('31000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000006', 'intermediario', 'Integração de embeddings bge-m3 e inferência local via Ollama')
ON CONFLICT (id) DO NOTHING;

-- 4. Projetos no Acervo
INSERT INTO projeto (id, nome, cliente, descricao, status)
VALUES
  ('40000000-0000-4000-8000-000000000001', 'Plataforma Sinapse', 'PRO4TECH', 'Memória institucional inteligente da fábrica de software para reutilização de requisitos e arquitetura.', 'ativo'),
  ('40000000-0000-4000-8000-000000000002', 'Portal de Pagamentos PIX', 'Banco Parceiro', 'Gateway bancário resiliente de alta disponibilidade para liquidação de pagamentos instantâneos.', 'ativo'),
  ('40000000-0000-4000-8000-000000000003', 'Sistema de Autenticação Unificada', 'TechCorp', 'Módulo centralizado de Single Sign-On (SSO) com OAuth2, JWT e controle de acesso RBAC.', 'ativo')
ON CONFLICT (id) DO NOTHING;

-- Alocação de Membros
INSERT INTO alocacao (id, desenvolvedor_id, projeto_id, papel)
VALUES
  ('32000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Tech Lead Backend')
ON CONFLICT (id) DO NOTHING;

-- 5. Épicos (Status 'concluido' para gerar indexação automática no acervo)
INSERT INTO epico (id, projeto_id, titulo, objetivo, escopo_macro, resultado_esperado, prioridade, status)
VALUES
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Gestão Inteligente de Requisitos', 'Capacitar POs na estruturação padronizada de histórias e cenários BDD.', 'Módulos de Épicos, Features, PBIs e Critérios de Aceitação', 'Redução de retrabalho na especificação e clareza para squads de desenvolvimento.', 'Must', 'concluido'),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'Motor de Busca Híbrida e RAG', 'Recuperação semântica e contextual do acervo histórico.', 'Vetorização com bge-m3, busca léxica via tsvector e fusão RRF no PostgreSQL.', 'Respostas precisas a consultas em linguagem natural com citação estrita de fontes.', 'Must', 'concluido'),
  ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000002', 'Processamento de Transações PIX', 'Garantir liquidação financeira idempotente abaixo de 2 segundos.', 'Endpoints de envio, recebimento, estorno e conciliação bancária.', 'Zero divergência financeira e conciliação automática.', 'Must', 'concluido')
ON CONFLICT (id) DO NOTHING;

-- 6. Features
INSERT INTO feature (id, epico_id, titulo, objetivo, prioridade, status)
VALUES
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Especificação Assistida por IA', 'Identificar lacunas, ambiguidades e termos vagos durante a escrita do requisito.', 'Must', 'concluido'),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'Consulta Híbrida no Acervo', 'Permitir pesquisa unificada combinando palavras-chave e similaridade conceitual.', 'Must', 'concluido'),
  ('60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', 'Chave PIX e Validação de Chaves', 'Cadastro e validação de chaves CPF, CNPJ, e-mail e chave aleatória.', 'Must', 'concluido')
ON CONFLICT (id) DO NOTHING;

-- 7. PBIs (Product Backlog Items)
INSERT INTO pbi (id, feature_id, codigo, titulo, historia_como_um, historia_eu_quero, historia_para_que, regras_observacoes, tipo, prioridade, score_completude, provenance, status)
VALUES
  ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'PBI-01.1.1', 'Cadastrar requisito estruturado com pontuação', 'Como Product Owner', 'quero cadastrar um PBI com título no infinitivo e história de usuário completa', 'para que os desenvolvedores compreendam o valor de negócio sem ambiguidades', 'O título deve iniciar com verbo no infinitivo. Os três blocos da história são mandatórios.', 'Funcional', 'Must', 100, 'human-authored', 'concluido'),
  ('70000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 'PBI-02.1.1', 'Consultar acervo por relevância semântica', 'Como Product Owner ou Desenvolvedor', 'quero pesquisar termos livres e receber trechos ordenados por proximidade vetorial e texto', 'para reaproveitar soluções já desenvolvidas em projetos anteriores da fábrica', 'A busca deve combinar similaridade vetorial (pgvector) e texto pleno (tsvector) com isolamento por projeto.', 'Funcional', 'Must', 100, 'human-authored', 'concluido'),
  ('70000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003', 'PBI-PIX-01', 'Validar chave PIX antes do envio', 'Como correntista', 'quero que a chave do destinatário seja consultada e exibida com os dados mascarados', 'para confirmar quem receberá o valor antes de autorizar a transferência', 'Consultar DICT em até 800ms. Exibir nome completo e primeiros dígitos do documento.', 'Funcional', 'Must', 100, 'human-authored', 'concluido')
ON CONFLICT (id) DO NOTHING;

-- 8. Critérios de Aceitação BDD
INSERT INTO criterio_aceitacao (id, entidade_tipo, entidade_id, texto, dado, quando, entao, nome, ordem)
VALUES
  ('80000000-0000-4000-8000-000000000001', 'pbi', '70000000-0000-4000-8000-000000000001', 'Cenário 1: Título e história preenchidos corretamente', 'que o PO está na tela de cadastro de requisito', 'submeter um PBI com título "Cadastrar usuário" e história completa', 'o sistema calcula a completude em 100% e salva o registro com sucesso', 'Cenário Padrão Válido', 1),
  ('80000000-0000-4000-8000-000000000002', 'pbi', '70000000-0000-4000-8000-000000000002', 'Cenário 1: Busca combinada retorna itens do projeto', 'que existem requisitos cadastrados no projeto selecionado', 'o usuário digitar "busca vetorial"', 'o sistema retorna os PBIs relevantes ordenados por score de fusão', 'Cenário de Busca Híbrida', 1),
  ('80000000-0000-4000-8000-000000000003', 'pbi', '70000000-0000-4000-8000-000000000003', 'Cenário 1: Chave PIX inexistente rejeitada', 'que o usuário informou uma chave não cadastrada no DICT', 'solicitar a validação da transferência', 'o sistema exibe mensagem de chave inexistente e impede o avanço', 'Cenário de Falha na Validação', 1)
ON CONFLICT (id) DO NOTHING;

-- 9. Relações entre PBIs (S2-15)
INSERT INTO pbi_relacao (id, pbi_origem_id, pbi_destino_id, tipo_relacao)
VALUES
  ('85000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', 'depende_de')
ON CONFLICT (id) DO NOTHING;

-- 10. Tags de Tecnologias nas Entidades
INSERT INTO entidade_tecnologia (id, entidade_tipo, entidade_id, tecnologia_id)
VALUES
  ('21000000-0000-4000-8000-000000000001', 'projeto', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('21000000-0000-4000-8000-000000000002', 'projeto', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004'),
  ('21000000-0000-4000-8000-000000000003', 'pbi', '70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004'),
  ('21000000-0000-4000-8000-000000000004', 'pbi', '70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000006')
ON CONFLICT (id) DO NOTHING;

-- 11. Decisões Arquiteturais
INSERT INTO decisao (id, entidade_tipo, entidade_id, titulo, decisao, contexto, justificativa, alternativas, autor_id)
VALUES
  ('90000000-0000-4000-8000-000000000001', 'projeto', '40000000-0000-4000-8000-000000000001', 'Adoção de pgvector integrado ao PostgreSQL', 'Utilizar pgvector como base vetorial unificada', 'Precisávamos armazenar embeddings de 1024 dimensões gerados pelo modelo bge-m3 com isolamento por projeto.', 'Evita subir banco vetorial separado (Chroma/Pinecone), mantendo consistência transacional ACID com as tabelas de negócio.', 'ChromaDB, Pinecone Cloud, Elasticsearch', '10000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000002', 'feature', '60000000-0000-4000-8000-000000000002', 'Fusão Recíproca de Ranqueamento (RRF)', 'Combinar buscas léxica e semântica com RRF k=60', 'Buscas puramente vetoriais perdem códigos exatos como PBI-01; buscas textuais puras perdem sinônimos e contexto.', 'A técnica RRF combina o ranqueamento de ambas sem necessitar de normalização arbitrária de pesos.', 'Busca vetorial pura, busca full-text com join manual', '10000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- 12. Protótipos de Interface
INSERT INTO prototipo (id, pbi_id, nome, url, tipo)
VALUES
  ('91000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'Figma - Formulário de Requisitos', 'https://www.figma.com/design/sinapse-requisitos', 'figma')
ON CONFLICT (id) DO NOTHING;

-- 13. Documentos e Chunks de Acervo
INSERT INTO documento (id, projeto_id, nome, mime, caminho, status_processamento)
VALUES
  ('92000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Arquitetura e Memória da Fábrica de Software.md', 'text/markdown', 'storage/arquitetura-sinapse.md', 'processado')
ON CONFLICT (id) DO NOTHING;

INSERT INTO chunk (id, projeto_id, entidade_tipo, entidade_id, texto, metadados_json)
VALUES
  ('93000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'documento', '92000000-0000-4000-8000-000000000001', 'A plataforma Sinapse atua como memória viva da fábrica de software PRO4TECH, permitindo que requisitos, decisões técnicas e competências da equipe sejam reutilizados.', '{"source_name":"Arquitetura e Memória da Fábrica de Software.md","dataset":"curated-dev","source_locator":"ARQ-01"}'::jsonb),
  ('93000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'documento', '92000000-0000-4000-8000-000000000001', 'A busca de acervo utiliza estratégia híbrida combinando índices HNSW com distância de cosseno no pgvector e índices GIN portuguese com websearch_to_tsquery no PostgreSQL.', '{"source_name":"Arquitetura e Memória da Fábrica de Software.md","dataset":"curated-dev","source_locator":"ARQ-02"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 14. Conversas e Mensagens de Chat
INSERT INTO conversa (id, usuario_id, projeto_id, titulo)
VALUES
  ('94000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', 'Dúvidas sobre arquitetura de embeddings')
ON CONFLICT (id) DO NOTHING;

INSERT INTO mensagem (id, conversa_id, remetente, conteudo, fontes_json)
VALUES
  ('95000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'user', 'Qual modelo de embedding é utilizado para o acervo?', '[]'::jsonb),
  ('95000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000001', 'assistant', 'O Sinapse utiliza o modelo BAAI/bge-m3 com dimensão de 1024 vetores executado localmente via Ollama, conforme decisão registrada na arquitetura.', '[{"title":"Arquitetura Sinapse","source_url":"/projects/40000000-0000-4000-8000-000000000001/documents"}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 15. Sugestões de IA (Staging para PO revisar)
INSERT INTO sugestao_ia (id, entidade_tipo, entidade_id, campo, valor_sugerido, origem, status, criado_por)
VALUES
  ('96000000-0000-4000-8000-000000000001', 'pbi', '70000000-0000-4000-8000-000000000001', 'regras_observacoes', 'Adicionar auditoria de criação do requisito gravando usuário_id e timestamp no padrão ISO 8601.', 'harness-copilot', 'pendente', '10000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- 16. Análise de Repositório (RepoAnalyzer)
INSERT INTO analise_repositorio (id, projeto_id, usuario_id, repositorio_url, run_id, status, etapa, etapa_label, progresso, relatorio_markdown, indexacao_status)
VALUES
  ('97000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'https://github.com/Galaticos-API/API-4', 'run-demo-01', 'concluido', 'completed', 'Concluído', 100, '# Relatório de Análise Arquitetural - Sinapse

## Visão Geral
O repositório implementa uma arquitetura conteinerizada com React 19, Node.js Express e PostgreSQL com extensão pgvector.

## Principais Componentes
* **Frontend**: SPA construída com React 19, TypeScript e Vite.
* **Backend**: API RESTful em TypeScript com autenticação JWT e validações determinísticas de qualidade.
* **IA e Vetorização**: Serviço FastAPI integrando Ollama local para modelos bge-m3 e qwen2.5.
', 'nao_aplicavel')
ON CONFLICT (id) DO NOTHING;

COMMIT;
