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
- CI configura ARCHIVE_TEST_DATABASE_URL para banco exclusivo com sufixo _test e executa ambos após migrations. Docker local indisponível nesta sessão; execução remota pendente de autorização para publicar a branch.
- Verificação visual em navegador e revisão humana ainda pendentes.

## Limitação de concorrência

A solução utiliza LOCK TABLE em ordem fixa nas quatro tabelas da hierarquia, serializando escritas e arquivamentos até o commit. Isso favorece consistência nesta etapa, mas limita paralelismo entre projetos; revisar a granularidade dos bloqueios se o volume crescer.
