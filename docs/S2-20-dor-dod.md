# S2-20 — Definições de Preparado e Pronto

Em `/admin`, a seção **Definições de Preparado e Pronto** permite cadastrar DoR e DoD independentes para épico, feature e PBI. Cada linha representa uma condição. Listas vazias removem as condições; instalações novas começam sem definições, sem presumir regras aprovadas pela organização.

Durante a criação e edição dos itens, os autores consultam as condições do nível correspondente. O painel informa quando não há condições cadastradas e permite atualizar a consulta. Alterações aparecem ao retornar à janela ou atualizar o painel. Falhas na consulta não modificam o formulário do item.

As definições são orientações descritivas. Não geram verificações automáticas, não mudam a completude nem o status dos itens. As verificações automáticas continuam sob a configuração da S2-19.

## API e persistência

- `GET /api/v1/quality/configuration/definitions`: sessão obrigatória; retorna `version`, `levels`, `updated_by`, `updated_by_name` e `updated_at`.
- `PUT` no mesmo endereço: somente administrador; recebe `expected_version` e todos os níveis, cada qual com `dor` e `dod`.
- Até 50 condições por definição, com até 500 caracteres por condição, em uma única linha. Rejeita condições vazias, duplicadas sem distinção de maiúsculas e Unicode equivalente, níveis ausentes e campos desconhecidos. O editor separa também linhas e parágrafos Unicode colados de outros editores.
- Uma transação grava a revisão e a auditoria `ATUALIZAR_DOR_DOD`, com conteúdo anterior/posterior, autor e data. Uma edição concorrente com versão antiga recebe 409 e mantém o texto digitado na interface.
- A migration `025_work_definitions.sql` cria a configuração inicial de forma idempotente. Não altera configurações de qualidade, conclusões nem snapshots dos itens.

## Validação

1. Como administrador, cadastre condições diferentes nos três níveis e salve.
2. Como PO, abra um item e clique em **Editar**. Consulte DoR/DoD no painel de qualidade e confira que aparecem somente as condições desse nível.
3. Confira também os formulários de criação. Se nenhuma condição estiver cadastrada, deve aparecer uma indicação explícita.
4. Tente salvar pela API como PO ou desenvolvedor: deve retornar 403. Consultas autenticadas permanecem permitidas.
5. Salve duas edições com a mesma versão: apenas uma deve ser gravada; a outra retorna 409.

Testes automatizados: `npm test` e `npm run build` em backend/frontend; `npm run test:integration:quality` e `npm run test:integration:review` no backend. Os testes de PostgreSQL e navegador usam bancos descartáveis.

Na revisão, foi corrigida a aceitação de múltiplas linhas dentro de uma condição pela API, que poderia modificar a estrutura da lista ao editar e salvar. Testes verificam ainda o rollback completo em falha de auditoria e a preservação do nome do autor após a exclusão da conta. A recarga das definições agora pede confirmação quando há edição pendente; cancelar mantém o texto, enquanto confirmar carrega a configuração persistida. A aba também avisa antes de fechar/atualizar com condições não salvas.

Validação em 25/10/2026: 60 testes do backend, 62 da interface, 17 com PostgreSQL e 13 de navegador aprovados (152 no total entre as rodadas). Builds, verificação de tipos e leitura da OpenAPI passaram. A última rodada repetiu os 62 testes da interface e os 13 de navegador, incluindo confirmação/cancelamento da recarga real. A cobertura inclui limites máximos de conteúdo, concorrência entre administradores, consulta na criação dos três níveis e atualização das definições durante a escrita sem perder o texto do item.

Para disponibilizar em um banco existente, aplique as migrações com `npm run migrate` no backend antes de iniciar os serviços. A revisão por outra pessoa permanece como etapa de aprovação da entrega.

Na verificação de integração com a `main` em `a449933`, as suítes de regressão de indexação e de qualidade passaram. O teste de banco também reaplica a migração 025 duas vezes sobre definições cadastradas e confirma que conteúdo, versão e autoria não mudam. A imagem Docker do backend já executa as migrações antes de iniciar o serviço.
