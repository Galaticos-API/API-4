# S2-19 — Qualidade da organização

A administração configura verificações independentes para épicos, features e PBIs na seção **Qualidade da organização**, em `/admin`. A lista de termos vagos é comum aos níveis. As alterações entram em vigor nas próximas consultas, sem reiniciar serviços; os painéis recarregam a política ao ganhar foco. O formulário administrativo mantém a edição e oferece recarga explícita.

## Padrões

- Épico: campos do guia, critérios de aceitação e termos vagos.
- Feature: campos do guia e termos vagos. A existência de critérios gerais é configurável, inicialmente desativada, mantendo o comportamento anterior (critério geral não é obrigatório para concluir uma feature).
- PBI: título no infinitivo, história completa, cenários estruturados, termos vagos e protótipo quando o item exige interface.

Somente verificações ativas e aplicáveis compõem o denominador da completude. Nenhuma aplicável resulta em `null`, em vez de uma pontuação fictícia. Termos vagos são informativos; campos obrigatórios, título/história/cenários de PBI e protótipo aplicável bloqueiam a conclusão enquanto estiverem ativos e pendentes. Rascunhos continuam editáveis.

## Contrato

- `GET /api/v1/quality/configuration/organization`: configuração efetiva e metadados (sessão obrigatória).
- `PUT /api/v1/quality/configuration/organization`: administrador envia `expected_version`, `levels`, `vague_terms` e `exigir_justificativa_item_concluido`. Rejeita configuração de outro nível, termos duplicados e chaves desconhecidas. Conflito de versão retorna 409; o formulário mantém a edição até recarregar.
- `GET /api/v1/quality/configuration/history?limit=25&before=N`: histórico da política a partir da implantação, com autor/data, exclusivo de administrador. Retorna `next_before` para continuar a paginação (máximo 100 registros). O nome histórico do autor permanece identificável se a conta for removida.
- `GET /api/v1/quality/items/{kind}/{id}`: verificações ativas, indicador atual e critérios registrados na conclusão. Exige acesso ao projeto; autorização e relatório usam o mesmo snapshot transacional de leitura.

A API anterior `/quality/configuration/pbi` é preservada: altera apenas verificações de PBI e os campos organizacionais compartilhados, sem apagar os demais níveis. Alterações feitas por essa API também entram no histórico.

## Conclusão e auditoria

A versão global da política é incrementada em cada gravação. A migration `024_organization_quality.sql` registra histórico imutável das revisões e captura a configuração na transação da conclusão auditada. A conclusão mantém um lock compartilhado sobre a política, impedindo que uma revisão concorrente mude os critérios entre validação e gravação.

Alterar a configuração não altera o status de nenhum item. O painel distingue o indicador atual da configuração utilizada na conclusão e exibe quando os critérios são anteriores. A configuração original e o dicionário ficam disponíveis para consulta. Conclusões anteriores à implantação, ou importadas sem avaliação registrada, são identificadas como não documentadas; a migração não inventa uma versão retroativa. Exclusão do projeto remove os registros vinculados.

O padrão legado permanece em `quality_configuration`; não é criada outra fonte de verdade. O versionamento global pode iniciar acima de 1 devido às migrações já existentes. A adição dos níveis não redefine políticas de PBI existentes. Nenhuma gravação de configuração modifica conteúdo dos itens, seus snapshots ou avaliações anteriores. Configurações e conteúdos não são impressos em logs.

## Validação

### Revisão consolidada em 25/10/2026

Revisão da S2-19 sobre a main `08af090`, sem avançar para a S2-20. Foram conferidos os padrões por nível, autorização administrativa, aplicação imediata do dicionário, cálculo da completude, histórico com autor/data, versões concorrentes, preservação dos itens concluídos e compatibilidade com a API anterior de PBI.

Quatro problemas foram reproduzidos em testes e corrigidos:

| Problema | Correção |
|---|---|
| Recarregar a configuração ou fechar/atualizar a aba podia perder alterações sem aviso. | A recarga pede confirmação quando há alterações pendentes, e o fechamento/atualização da aba recebe o aviso padrão. Cancelar mantém termos, flags e política em edição. |
| A API aceitava quebras internas de linha em um termo, enquanto o editor separava apenas parte dos tipos de quebra. Salvar novamente podia modificar a estrutura do dicionário. | Cada termo deve ocupar uma linha nas duas APIs. O editor separa CR/LF e os separadores Unicode de linha/parágrafo antes do envio. |
| Consultas com sinal externo de cancelamento substituíam o prazo padrão HTTP e podiam deixar o painel carregando indefinidamente. | Configuração, histórico e relatório têm prazo de 15 segundos, preservando o cancelamento do componente. |
| Dados da API eram usados sem validar configuração, histórico ou relatório; um salvamento malformado também anunciava atualização antes da validação. | As respostas são validadas antes de atualizar a tela ou anunciar sucesso. Falhas seguem os avisos recuperáveis existentes, preservando a edição. |

A validação passou: build da interface, 112 testes da interface, typecheck e 70 testes do backend, 27 testes de qualidade/RAG em PostgreSQL, 89 de regressão de indexação e 13 de navegador autenticado. A nova regressão HTTP comprova que dicionários inválidos retornam 400 nas duas APIs sem publicar outra versão da política. A OpenAPI foi atualizada e lida sem erros, com 104 caminhos. Um teste opcional de indexação com IA real permanece ignorado; as verificações da S2-19 são determinísticas. Não foram encontradas outras falhas nos caminhos testados. Não é necessária migração: políticas, avaliações de conclusão e históricos já persistidos não são reescritos.

- `npm --prefix backend run build` e `npm --prefix backend test`
- `npm --prefix frontend run build` e `npm --prefix frontend test`
- `npm --prefix backend run test:integration:quality`: PostgreSQL isolado para padrões, níveis, dicionário, conclusão, metadados, permissões, rollback e conflito de versões.
- `npm --prefix backend run test:integration:indexing`: regressões de snapshots, indexação e contratos anteriores.
- `npm --prefix backend run test:integration:review`: navegador autenticado, administração, política por nível, dicionário, layout mobile e manutenção de itens concluídos.

Uma revisão do PR por outra pessoa permanece como etapa externa de aprovação.

O workflow `report-review.yml` executa também `test:integration:quality`, para que os testes específicos de configuração, conclusão e histórico em PostgreSQL sejam exigidos no PR.

Na revisão local, foram acrescentadas regressões para os termos vagos nas observações e no nome dos cenários de PBI, incluindo a leitura das observações pela interface e a navegação até o campo. A avaliação da conclusão também preserva a data e a autoria da versão da política, separadas da data da avaliação do item.

Uma rodada adicional cobre expressões compostas: o nome e os blocos de um cenário são verificados separadamente, evitando formar um termo vago ao juntar campos distintos. Outro teste pausa uma conclusão real após a validação e solicita uma atualização concorrente da política; a nova versão só é publicada depois da conclusão, cujo registro conserva a versão anterior.

A revisão final também cobre paginação completa do histórico, sem versões repetidas ou omitidas, limites inválidos e permissão administrativa. Durante a recarga da configuração, a interface bloqueia a paginação antiga para não misturar resultados de consultas distintas.

Validação final em 25/10/2026: builds aprovados; 57 testes do backend, 53 da interface, 15 de qualidade com PostgreSQL e 12 de navegador aprovados. A regressão de indexação teve outros 89 testes aprovados na rodada anterior, com um teste opcional de modelo de IA real ignorado. A S2-19 usa verificações determinísticas, sem depender de IA.
