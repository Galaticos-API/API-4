-- SINAPSE: dados fictícios para desenvolvimento (nunca usar em produção)
BEGIN;

INSERT INTO projeto (id, nome, cliente, descricao, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Projeto Demonstração', 'Cliente Fictício', 'Base de demonstração sem dados reais.', 'em_andamento')
ON CONFLICT (id) DO NOTHING;

INSERT INTO epico (id, projeto_id, titulo, objetivo)
VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Organização do backlog', 'Estruturar requisitos do projeto.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO feature (id, epico_id, titulo, objetivo)
VALUES ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000011', 'Consulta de requisitos', 'Permitir localizar requisitos demonstrativos.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO pbi (id, feature_id, codigo, titulo, historia_como_um, historia_eu_quero, historia_para_que)
VALUES ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000021', 'DEMO-01', 'Consultar requisito', 'Como pessoa do time', 'quero consultar um requisito', 'para entender o comportamento esperado')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tecnologia (id, nome, categoria)
VALUES ('00000000-0000-0000-0000-000000000041', 'TypeScript', 'backend'),
       ('00000000-0000-0000-0000-000000000042', 'PostgreSQL', 'database')
ON CONFLICT (id) DO NOTHING;

COMMIT;
