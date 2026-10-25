# S2-16 — Versões de especificações

Épicos, features e PBIs passam a ter snapshots dos campos, critérios de aceitação e tecnologias. Cada alteração auditada que modifica esse estado gera uma versão numerada na mesma transação da escrita. Eventos sem mudança de especificação não geram versões repetidas. O bloqueio da entidade serializa a numeração entre gravações concorrentes.

No histórico do item, a seção **Versões da especificação** lista autor e data, da versão mais recente para a mais antiga. Selecione uma versão de origem e outra de destino e clique em **Comparar versões**. Somente campos diferentes aparecem, com valores de antes/depois. A comparação é de leitura e não restaura nem sobrescreve o item.

## API

- `GET /api/v1/audit/{entidade_tipo}/{entidade_id}/versions`: páginas de 25 versões, até 100 com `limit`; `before` continua a partir do número retornado em `next_before`. Filtros opcionais: `autor_id`, `desde` e `ate` (datas ISO com fuso, intervalo inclusivo).
- `GET /api/v1/audit/{entidade_tipo}/{entidade_id}/versions/compare?de=1&para=2`: compara duas versões distintas pertencentes ao mesmo item. Retorna metadados, snapshots e `campos` com `campo`, `anterior`, `novo`.

Ambas exigem sessão e acesso ao projeto. Desenvolvedores precisam de alocação ativa. A consulta de um item inacessível retorna 404. Não há endpoint para alterar snapshots; a aplicação apenas os acrescenta nas transações auditadas. As rotas continuam disponíveis para itens arquivados.

## Migração

A migration `023_item_versions.sql` cria a tabela e captura snapshots por trigger da auditoria. Para itens existentes, registra somente uma referência do estado atual, identificada como `REFERENCIA_INICIAL`, sem inventar autor ou data de edições antigas. Os históricos antigos e `pbi_versao` permanecem preservados; não são reconstruídos como snapshots completos porque não incluem todos os campos e critérios. A reaplicação não duplica referências. Exclusão do projeto remove seus snapshots por cascata.

## Validação

- `cd backend; npm run build; npm test`
- `cd frontend; npm run build; npm test`
- `cd backend; npm run test:integration:indexing` (PostgreSQL/pgvector isolado, incluindo snapshots, rollback, concorrência, critérios, tecnologias, filtros e autorização HTTP).
- `cd backend; npm run test:integration:review` (navegador autenticado, edição real e comparação no desktop/mobile).

O código não registra snapshots, conteúdo de campos ou credenciais em logs. A revisão do PR por outra pessoa é uma etapa externa à implementação.

Validação local em 25/10/2026, integrada à main `071c9f4`: builds backend/frontend aprovados; 54 testes do backend e 45 da interface aprovados; 89 testes com PostgreSQL aprovados (um teste opcional com modelo real ignorado); 11 testes de navegador autenticado aprovados. Scripts Windows e configuração Docker Compose também validados.

## Revisão de QA

### Revisão consolidada após a S2-24 — 25/10/2026

Revisão realizada sobre a main `8aa9959`, limitada à S2-16. Foram conferidos o PBI-01.5.4, os campos preservados nos snapshots, numeração concorrente, transações e rollback, migração/reaplicação, filtros de autor/data, paginação, autorização por projeto, comparação, atualização da interface e navegação desktop/mobile.

Dois problemas adicionais foram reproduzidos em testes e corrigidos:

| Problema | Correção |
|---|---|
| Listagem e comparação passavam apenas o sinal externo de cancelamento, substituindo o prazo padrão da camada HTTP. Uma conexão sem resposta podia manter a tela ocupada indefinidamente. | Prazo de 15 segundos combinado ao sinal do componente. A saída do item continua cancelando a consulta imediatamente. |
| Respostas JSON eram tratadas como válidas apenas por coerção de tipos. Listas, metadados ou diferenças malformadas podiam causar falha na renderização. | Validação dos dados antes de entregá-los à tela, incluindo paginação, autor/data e campos da comparação. A resposta precisa corresponder às versões solicitadas; falhas seguem o aviso e a opção de recarga existentes. |

Onze novos casos cobrem os dois prazos, dados malformados, paginação válida, comparação em ordem inversa, textos completos, booleanos, nulos e cancelamento. A verificação final passou: build da interface, 97 testes da interface, typecheck e 69 testes do backend, 89 testes nas suítes PostgreSQL/indexação e 13 testes de navegador autenticado. O teste opcional de indexação com modelo real permaneceu ignorado. Não foram encontradas novas falhas nos caminhos de snapshots, autorização, concorrência e comparação exercitados no banco. Estas correções não exigem migração nem alteram os snapshots existentes.

- Arquivamento em cascata: o evento do ancestral agora registra as versões dos descendentes na mesma transação, mantendo autor e justificativa e evitando repetir estados já arquivados.
- Parâmetros inválidos: números de versão respeitam o limite do INTEGER do PostgreSQL; datas são validadas e normalizadas para UTC. Valores fora do contrato retornam 400 em vez de falha interna.
- Atualização da interface: incluir, remover ou reordenar critérios e resolver sugestões atualiza o histórico sem recarregar a página ou apagar outros formulários. O navegador verifica inclusão/remoção de critério e aceite/edição/descarte de sugestões.
- Revogação concorrente: a consulta dos snapshots também aplica a permissão do projeto, além da autorização inicial. O teste encerra uma alocação entre a autorização e a leitura e comprova que nenhum snapshot é retornado.
- Snapshots antigos de PBI são identificados como legados na auditoria, para não confundir sua numeração com as novas versões da especificação.

## Integração com a main

Os conflitos em `EpicsView`, `FeaturesView`, `PbiDetail` e `SuggestionsPanel` foram combinados preservando o `refreshKey` do reaproveitamento de itens (S2-12) e os callbacks de atualização do histórico (S2-16). O teste de navegador percorre reaproveitamento, aceite e comparação de versões em épico, feature e PBI, usando banco real e embeddings determinísticos.

O teste de migração roda em banco separado: reaplicar DDL no banco compartilhado com outras suítes concorrentes causava deadlock. A suíte principal continua executando testes de aplicação em paralelo, incluindo o contrato de itens semelhantes.
