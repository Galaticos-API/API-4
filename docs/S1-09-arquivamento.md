# S1-09 — Arquivamento da hierarquia

Integração sobre main 3b79532, incluindo a S1-08 recuperada na PR #24.

## Entrega

- Projeto, épico, feature e PBI possuem prévia, confirmação explícita, cascata e data de arquivamento.
- A prévia conta somente itens ainda não arquivados, incluindo o próprio item; mudança nas quantidades retorna HTTP 409 e exige nova confirmação.
- Listas excluem arquivados por padrão; status=arquivado e status=todos permitem consulta.
- Detalhes arquivados preservam critérios e conteúdo em modo leitura, com data ou indicação de data histórica desconhecida.
- Novas criações, edições, conclusão e mudanças de critérios revalidam a hierarquia dentro da transação, após obter o bloqueio compartilhado pelo fluxo de arquivamento.
- Auditoria e cascata são atômicas; repetição não duplica auditoria nem altera a data. Itens já arquivados mantêm a data original.
- As permissões de escrita permanecem restritas a PO/admin.

## Banco e API

Aplicar npm run migrate em backend. A migration 010_hierarchy_archive.sql substitui a antiga migration da branch 005_hierarchy_archive.sql. Ela permite arquivado nos estados de feature/PBI, adiciona datas, preserva registros e corrige os defaults de novas entidades para rascunho.

GET /api/v1/{epics|features|pbis}/{id}/archive-impact retorna { epicos, features, pbis }.
PATCH no mesmo caminho /archive exige { confirmado: true, impacto: <prévia> }; justificativa é opcional, até 2000 caracteres.
O projeto mantém seu contrato, que acrescenta projeto à contagem. Contratos em docs/api/openapi.yaml.

## Validação

- Backend: build aprovado; 151 testes aprovados, 3 testes de banco/seed ignorados sem as variáveis de ambiente.
- Frontend: 76 testes aprovados e build aprovado.
- Testes PostgreSQL: projects.archive.db.test.ts e hierarchy-archive.db.test.ts cobrem cascata, arquivamento em cada nível, isolamento, preservação de critérios, rollback por auditoria, repetição, filtros e rejeição de escrita após arquivamento.
- Validação local em 21/09/2026, commit 729948e: PostgreSQL 16 + pgvector em contêiner isolado. Os dois arquivos de teste de arquivamento passaram: 11 testes, zero falhas e zero ignorados.
- Todas as 13 migrations foram aplicadas em banco vazio; a segunda execução não reaplicou nenhuma. `test:integration:s105` passou nos quatro cenários (`empty`, `legacy`, `backlog`, `both`), incluindo preservação de dados, repetição e rollback de auditoria.
- O banco da aplicação não foi alterado. O contêiner temporário foi removido após a validação.
- CI configura ARCHIVE_TEST_DATABASE_URL para banco exclusivo com sufixo _test e executa ambos após migrations. Execução remota pendente de autorização para publicar a branch.
- Verificação visual em navegador e revisão humana ainda pendentes.

## Limitação de concorrência

A solução utiliza LOCK TABLE em ordem fixa nas quatro tabelas da hierarquia, serializando escritas e arquivamentos até o commit. Isso favorece consistência nesta etapa, mas limita paralelismo entre projetos; revisar a granularidade dos bloqueios se o volume crescer.

## Revisão complementar — 22/09/2026

A correção de assertWritable em caacef9 ainda deixava bloqueios de ativo nos serviços, nos critérios e na interface. Essas camadas agora permitem edição, conclusão, criação de filhos e critérios em épicos ativos; arquivado continua bloqueado. Os contratos canônico e legado foram alinhados.

O teste PostgreSQL de hierarquia ativa agora usa os serviços da aplicação e cobre edição, critérios (criação, ordem e remoção), criação de feature/PBI, conclusão e posterior arquivamento com rejeição de escrita. O teste específico da migration 010 entrou no CI; seu pool usa uma conexão para preservar o search_path dos schemas isolados.

Validação local: 151 testes backend aprovados (5 testes condicionais ignorados nessa execução); 78 testes frontend aprovados; ambas as compilações aprovadas. Execução separada em PostgreSQL 16 + pgvector: 15 testes aprovados, nenhum ignorado; compatibilidade S1-05 aprovada nos quatro cenários. Banco da aplicação preservado.

## Integração da main — conflitos da PR #28

Main 8a44d16 integrada em 22/09/2026, preservando Swagger, autenticação por token e a nova organização de módulos em frontend/src/api. Os componentes de arquivamento foram adaptados aos novos caminhos; os testes verificam Authorization tanto na prévia quanto na confirmação. Preservadas as regras de hierarquia ativa e leitura dos arquivados.

Validação após integração: backend 145 testes aprovados e 5 condicionais ignorados; frontend 78 aprovados; builds aprovados. PostgreSQL isolado: 14 migrations aplicadas, 15 testes de arquivamento/migration aprovados sem ignorados, quatro cenários de compatibilidade aprovados. A contagem do backend mudou com a suíte de autenticação trazida pela main.
