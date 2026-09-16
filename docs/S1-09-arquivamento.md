# S1-09 — Arquivamento em cascata

Branch: `feature/s1-09-archiving`. Referência: PBI-01.1.6.

## Escopo implementado

- Projeto: prévia das quantidades, confirmação explícita e cancelamento na interface.
- Cascata transacional Projeto → Épico → Feature → PBI, sem exclusão física.
- Contagem considera somente registros ainda não arquivados. Datas anteriores são preservadas.
- Confirmação revalida a contagem; alteração retorna 409 e exige nova prévia.
- Auditoria e cascata na mesma transação; falha reverte ambas. Repetição não duplica auditoria.
- Listagem padrão exclui arquivados; filtros de arquivados e todos. Detalhe arquivado mostra data e somente leitura.
- PO/admin podem arquivar; dev pode consultar. Cadastro/edição não aceitam status arquivado como atalho.
- Erros inesperados no middleware registram somente código técnico, sem SQL, valores de linha ou corpo da requisição.

## Banco e contrato

Executar `npm run migrate` em `backend` antes de iniciar a versão atualizada.
A migração 005 adiciona status aos filhos e `archived_at` aos quatro níveis.
Descendentes de projetos já arquivados são regularizados; a data histórica desconhecida permanece nula e é identificada na interface.

`GET /api/v1/projects/:id/archive-impact` retorna `{ projeto, epicos, features, pbis }`.
`PATCH /api/v1/projects/:id/archive` exige `{ confirmado: true, impacto: <prévia> }`.
`justificativa` é opcional (até 2000 caracteres). O contrato completo está em `api/openapi.yaml`.

O arquivamento bloqueia escrita nas quatro tabelas durante a transação para manter contagem/cascata consistentes com inserções concorrentes. É uma solução conservadora para esta etapa; serializa arquivamentos de projetos distintos e deve ser reavaliada conforme o volume aumentar.

## Validação

- Backend: `npm test` e `npm run build`.
- Frontend: `npm test` e `npm run build`.
- Teste real de PostgreSQL: definir `ARCHIVE_TEST_DATABASE_URL` para um banco exclusivo de testes (nome com `_test`), previamente migrado, e executar `node --import tsx --test src/modules/projects/projects.archive.db.test.ts` em `backend`.
- A CI executa o teste de cascata no serviço PostgreSQL do job de seed.
- O teste de banco verifica contagem, conflito, rollback por falha de auditoria, todos os descendentes, preservação de critério/data, isolamento de outro projeto, idempotência, bloqueio de edição e filtros.
- Testes da interface verificam cancelamento, confirmação, duplicidade, falhas, permissões, filtro e modo leitura. O dialog é simulado em jsdom; isso não substitui validação visual no navegador.

Roteiro manual: entrar como PO/admin, abrir projeto com filhos, consultar prévia e cancelar; repetir e confirmar; verificar remoção da lista padrão; escolher Arquivados; abrir o detalhe e verificar data/modo leitura. Perfil dev não deve apresentar a ação de arquivamento.

## Pendências para concluir o PBI integralmente

Esta base ainda não contém as telas/endpoints de edição dos níveis Épico, Feature e PBI previstos nas dependências da S1-08. A cascata iniciada no projeto está implementada, mas arquivar diretamente esses níveis e consultar seus detalhes/listas com filtro depende dessa integração.

Os futuros escritores devem impedir criação/edição sob ancestrais arquivados, inclusive após aguardar locks; o bloqueio da transação atual não substitui essa regra. Ainda faltam demonstração visual do fluxo integrado, revisão por outra pessoa e publicação/CI remota desta branch. Não marcar S1-09 como integralmente concluída antes dessas etapas.
