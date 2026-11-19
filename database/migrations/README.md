# Migrações do banco

As alterações estruturais do banco devem ser numeradas e aplicadas em ordem
(`001_...sql`, `002_...sql`, etc.). Cada arquivo deve ser idempotente quando
possível e conter apenas a alteração daquela versão.

O baseline inicial é `database/init.sql`. Em volumes já existentes, o backend
executa migrations pendentes ao iniciar o container e registra o resultado em
`_schema_migrations`. Para executar no host, use `npm --prefix backend run migrate`
com as variáveis corretas. Consulte o [guia de setup](../../docs/SETUP_GUIDE.md).

## Baseline atual

`database/init.sql` é o baseline inicial do projeto e é executado pelo
PostgreSQL na criação de um volume novo. Ele corresponde à versão `001` do
schema (PRE-02). A migration `002` completa estruturas de domínio que não
faziam parte do DDL inicial.

Antes de alterar tabelas existentes, crie uma nova migration numerada. Não
edite `init.sql` para corrigir um banco já criado: volumes existentes não
executam novamente os scripts de inicialização.

## Validação

```powershell
docker compose up -d postgres
docker compose exec postgres psql -U sinapse -d sinapse -c '\dt'
```

Para ambientes existentes, a aplicação das migrations deve ser feita em uma
transação e registrada no controle de versão do ambiente antes do deploy.

## Consolidação S1-05

As duas migrations 005 são histórico publicado e não devem ser renomeadas.
O runner registra o nome completo. `004_z_prepare_criteria_order.sql` precisa
ordenar antes de `005_backlog_hierarchy_domain.sql` para preparar critérios
legados antes da criação do índice único. `006_reconcile_epic_status.sql`
uniformiza a constraint preservando os estados legados como somente leitura
na API de épicos. Veja também a documentação de execução e recuperação nesta seção.

`npm run test:integration:s105` no backend valida banco vazio, histórico antigo,
histórico backlog e ambas as migrations, com repetição e rollback de auditoria.
Exige `S105_TEST_DATABASE_URL` apontando para PostgreSQL local descartável cujo
nome termina em `_s105_test`. O teste cria/remove somente schemas próprios.

## S1-16: vínculos de tecnologia

`011_unique_entity_technology.sql` normaliza associações duplicadas e cria a
chave única de `(entidade_tipo, entidade_id, tecnologia_id)`. A API atualiza os
vínculos dentro da mesma transação que cria/edita épicos, features e PBIs.
`BACKLOG_TREE_TEST_DATABASE_URL` habilita os testes reais da árvore e dos
vínculos; use somente um banco descartável cujo nome termine em `_test`.

## Retomada do #22 após o #23

`007_criteria_polymorphic_format.sql` torna `criterio_aceitacao.texto` opcional e
acrescenta a constraint polimórfica (texto obrigatório para épico/feature; nome,
dado, quando e então obrigatórios para PBI). O `init.sql` ainda declara `texto`
como `NOT NULL` — corrigir isso é responsabilidade desta migration, não do
baseline. Se alguma linha existente violar a constraint, o `ALTER TABLE` falha e
interrompe a migration sem apagar dados; não há saneamento automático aqui.

## Configuração organizacional de qualidade (S2-19 parcial)

`008_quality_organization_configuration.sql` cria a configuração versionada das
verificações de qualidade de PBI e da lista de termos vagos. Como o sistema ainda
não possui entidade de organização, a linha singleton representa a organização
única atual. Alterações devem passar pela API administrativa, que registra autor,
data e valores anterior/novo na auditoria. A configuração não modifica o status
dos PBIs já concluídos. Esta migration não implementa regras de épico/feature nem
DoR/DoD (PBI-01.6.2), entregues separadamente na S2-20.
O cenário PostgreSQL de `npm run test:integration:s105` valida configuração
padrão, versionamento, autor/data, auditoria e rollback quando a autoria não é válida.

## Aplicabilidade da verificação de protótipo (S1-15)

`009_pbi_interface_quality.sql` registra se cada PBI exige interface e adiciona
à configuração de qualidade a verificação `prototipo_vinculado`. Ela só é
aplicável quando `pbi.requer_interface` é verdadeiro; seu resultado consulta a
tabela `prototipo` já existente, indexando a chave de vínculo. PBIs legados recebem
`false` para não presumir que necessitam interface. A migration preserva os demais ajustes da política e
incrementa sua versão ao introduzir a nova regra. A atualização da política fica
registrada em `auditoria` como alteração de migration (sem atribuir a um admin).
O teste PostgreSQL de compatibilidade verifica aplicabilidade, presença/ausência
de protótipo e reexecução idempotente.

## Registro de decisões (S1)

`013_decision_records.sql` cria o armazenamento de decisões vinculadas aos
níveis do backlog e seus índices de consulta. Rotas e schemas estão no
[OpenAPI](../../docs/api/openapi.yaml); o backend valida o vínculo com o projeto
e registra auditoria.

## Testes PostgreSQL descartáveis

Testes de integração devem apontar para bases descartáveis com os sufixos
exigidos por cada script (`_test`, `_s105_test` etc.). Não use a base local
compartilhada. Consulte os comandos e as proteções no [guia de setup](../../docs/SETUP_GUIDE.md)
e nos scripts de `backend/package.json`.

## Harness da IA por modo (S2-09)

`019_ai_harness.sql` cria o histórico de revisões da configuração dos modos de IA.
A versão zero é distribuída no código; as demais revisões são acrescentadas pelo
backend com autoria e data. O teste `npm run test:integration:harness` aplica a
migration em PostgreSQL descartável e verifica concorrência e atualização sem
reinício. Consulte [S2-09](../../docs/S2-09-HARNESS.md) para configuração e execução.

## Escopo explícito do chat

`026_chat_scope.sql` registra se a conversa consulta um projeto ou todos os
projetos atualmente autorizados ao usuário. Conversas legadas sem projeto são
marcadas como `indisponivel`, evitando ampliar o escopo ou expor histórico sem
proveniência verificável. O modo geral recalcula os projetos autorizados a cada
consulta e valida as fontes persistidas antes de reexibir o histórico.
## 023 — Versões de especificações (S2-16)

`023_item_versions.sql` acrescenta snapshots de épicos/features/PBIs na transação da auditoria. Inclui campos, critérios e tecnologias. A referência inicial dos itens existentes não presume autoria histórica; o histórico anterior permanece preservado. Consultas paginadas e comparação exigem acesso ao projeto. Detalhes e testes em `docs/S2-16-versoes.md`.

## 024 — Qualidade da organização (S2-19)

`024_organization_quality.sql` amplia a política existente com níveis de épico/feature, preserva a configuração de PBI e adiciona histórico de revisões e registro dos critérios de conclusão. As conclusões antigas são explicitamente não documentadas, sem atribuição retroativa de critérios. Detalhes em `docs/S2-19-qualidade-organizacao.md`.

## 025 — Definições de Preparado e Pronto (S2-20)

`025_work_definitions.sql` cria DoR e DoD descritivas por nível, com versão e autoria, inicialmente sem condições. As revisões são auditadas pelo backend. Não altera o motor de qualidade nem as conclusões. Detalhes em `docs/S2-20-dor-dod.md`.

## 027 — Origem das mensagens do chat

`027_chat_message_origin.sql` persiste a classificação da resposta do assistente (`assistente`, `busca_textual` ou `sem_resultado`) para restaurar o estado visual ao reabrir conversas. Mensagens antigas ficam sem origem quando ela não pode ser reconstruída com segurança. Evidências literais já validadas são guardadas junto das fontes em `fontes_json`, associadas aos IDs dos chunks citados e protegidas pelo escopo de projeto da conversa.

## 028 — Perfis profissionais e vínculo único de desenvolvedor (S3-08)

`028_developer_profiles.sql` adiciona `nome` e `updated_at` em `desenvolvedor`, permite cadastrar perfis antes ou com vínculo a `usuario`, sincroniza o nome a partir do usuário vinculado quando omitido e cria o índice único `uq_desenvolvedor_usuario_id` para impedir perfis duplicados para o mesmo usuário (`PBI-05.1.1`). Também indexa `competencia` e `alocacao` por desenvolvedor para suportar a consulta consolidada de perfil (`PBI-05.1.4`) sem armazenar dados pessoais fora do propósito profissional.

## 029 - Vocabulário controlado de tecnologias (S3-14)

`029_technology_vocabulary.sql` cria a função `normalizar_nome_tecnologia` (minúsculas, sem acentos, pontuação e espaços, preservando `+` e `#` para distinguir C, C++ e C#) e o índice único `uq_tecnologia_nome_normalizado`, impedindo variações como "Node.js" e "NodeJS" (`PBI-06.2.2`). Antes do índice, unifica variações já cadastradas no registro mais antigo, redirecionando competências e classificações de itens sem violar `uq_entidade_tecnologia_association`. Também adiciona `updated_at` e índices por tecnologia para a contagem de associações exigida na remoção consciente.

## 030 - Competências com nível e evidência (S3-09)

`030_competencies.sql` adiciona `updated_at`, normaliza níveis legados para `intermediario`, exige nível dentro da escala `iniciante`, `intermediario`, `avancado` e `especialista` (`ck_competencia_nivel`) e cria `uq_competencia_desenvolvedor_tecnologia`, uma competência por tecnologia em cada perfil (`PBI-05.1.2`). Repetições antigas são unificadas no registro de maior nível, juntando as evidências distintas.

## 031 - Alocações com papel e período (S3-10)

`031_allocations.sql` adiciona `created_at` e `updated_at`, torna `papel` e `data_inicio` obrigatórios (papéis vazios antigos viram "Integrante") e cria `ck_alocacao_periodo`, que impede término anterior ao início (`PBI-05.1.3`). A restrição é `NOT VALID`: períodos invertidos legados não são reescritos automaticamente, porque a alocação vigente define o acesso do profissional ao projeto; toda inclusão ou alteração nova é validada. O histórico consolidado (`PBI-05.2.3`) continua derivado das alocações na leitura do perfil.

