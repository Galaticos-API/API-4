# Plano de correção QA — PR #36 (S1-24)

**Objetivo:** corrigir os desvios encontrados na regra de justificativa e no histórico de auditoria da PR #36, preservando o comportamento existente de backlog e a base atual da `main`.

**Estado atual:** correções publicadas na branch da PR #36 em quatro commits (`f75903e`, `b46ba35`, `d79360d`, `3287bb3`). A base continua sendo a `main` atual (`4df5a48`); nenhum merge foi feito. Build/testes locais e todos os checks da CI estão verdes, incluindo as integrações PostgreSQL dedicadas.

**Baseline da execução:** backend: `npm test` passou (152 aprovados, 5 ignorados por dependência de ambiente externo). Frontend: o runner local usa Node `v26.7.0`, no qual `localStorage` não foi disponibilizado pelo ambiente de teste; 73 testes falharam antes/durante renderizações (incluindo chamadas a `window.localStorage.clear`) e vários expiraram. Tratar esse resultado como limitação de baseline até repetir com a versão/runtime exigida pela CI. `npm ci` foi executado em ambos os pacotes do worktree.

**Decisão de autorização (Etapa 0/F6):** as rotas de escrita do backlog usam papéis globais `admin`/`po`; não foi encontrado middleware/relacionamento de membership usuário–projeto nos endpoints de backlog. A rota de histórico já exige sessão. Portanto, esta correção preservará o modelo global atual, validará `entidade_tipo` contra a enumeração do domínio e UUID/existência da entidade, e não inventará isolamento por projeto. Se a política de produto mudar, o isolamento deve ser implementado transversalmente aos endpoints de backlog, não apenas nesta rota.

**Desenho antes das alterações maiores (F1/F2/F4):** manter validação de serviço para retorno rápido, mas tornar a validação transacional autoritativa. Depois do lock de hierarquia/entidade, reler o status atual e a configuração de justificativa pelo mesmo `PoolClient`; quando aplicável, rejeitar justificativa ausente/vazia e registrar a justificativa no evento de auditoria da mesma transação. Critérios e edições de épico/feature/PBI usarão a mesma função de política, para não haver contratos divergentes. Na UI, obter a configuração real para decidir quando pedir justificativa; a API permanece responsável por impor a regra.

**Desenho antes do histórico (F3/F5/F7):** separar estados de sucesso-vazio e falha; paginação será aditiva e retrocompatível com clientes que esperam `items`, com `limit` máximo e cursor estável usando `(created_at, id)`. A UI fará carregamento incremental. A trilha existente (`dados_json`, `pbi_versao`) será apresentada com campos alterados/valores legíveis sem expor JSON bruto; preservar leitura de eventos legados e limitar a exibição a campos de backlog autorizados pelo contrato atual.

**Verificação de autorização do F6:** backlog é global por papel hoje, enquanto isolamento explícito no contexto canônico se aplica à busca/RAG por projeto. O plano não aplicará membership somente ao audit endpoint. Erros de tipo de entidade inválido serão rejeitados em vez de responder lista vazia; entidade inexistente não retornará trilha.

**Revisão interna após fatia F1/F2/F4:** política compartilhada agora consulta status do item e configuração usando o mesmo `PoolClient`, depois dos locks; a linha singleton da configuração recebe lock compartilhado para que alteração administrativa aguarde o fim da mutação. Eventos de critérios recebem justificativa. Um teste PostgreSQL foi incluído no arquivo já executado pela CI e cobre todas as entidades, os três tipos de mutação de critério e uma pré-leitura obsoleta; localmente esse teste permanece ignorado sem `ARCHIVE_TEST_DATABASE_URL`. Testes unitários de política e preservação da configuração passaram.

**Decisão de paginação F5:** implementar cursor opaco base64url contendo timestamp ISO e UUID, ordenado por `(created_at DESC, id DESC)`, com limite padrão 25 e máximo 100. A resposta manterá `items` e adicionará `next_cursor`; clientes antigos que ignoram campos adicionais continuam compatíveis. O frontend carrega mais sob demanda.

**Revisão de escopo F7 antes da implementação:** além de adicionar `anterior`/`novo` à auditoria das atualizações, a rota paginada de histórico de PBI vai associar cada evento ao snapshot de `pbi_versao` persistido na mesma transação (chaveando pela entidade, timestamp transacional e autor). A UI exibirá o número da versão e só os campos de backlog autorizados, mantendo o JSON completo fora da resposta visível. Isso evita uma API independente e faz a tela aproveitar o versionamento que a PR já grava.

## Regras de execução

- Fazer uma fatia por vez e revisar o diff antes de começar a seguinte.
- Não misturar refatorações ou mudanças de escopo com as correções QA.
- A política de justificativa deve ser aplicada no servidor; validações de interface são apenas orientação para o usuário.
- Auditoria e alteração de negócio devem confirmar ou falhar na mesma transação.
- Preservar compatibilidade da API e os comportamentos atuais para rascunhos, itens ativos, arquivados e usuários sem permissão.
- Não alterar autorização por suposição: primeiro confirmar o contrato atual de visibilidade entre usuários e projetos.
- Não fazer merge. Ao final, publicar/atualizar a branch da PR e pedir nova revisão somente depois dos gates definidos abaixo.

## Achados e prioridade

| ID | Prioridade | Achado | Estado |
|---|---|---|---|
| F1 | P1 | Critérios de item concluído podem ser alterados sem justificativa | Corrigido; cobertura unitária e de integração adicionada |
| F2 | P1 | A validação de status/configuração pode ficar obsoleta entre serviço e transação | Corrigido com validação sob lock na transação; teste PostgreSQL dedicado passou na CI |
| F3 | P2 | Falha ao buscar histórico é exibida como histórico vazio | Corrigido com estados de erro e retry; testes de componente verdes |
| F4 | P2 | Salvar configuração de qualidade pode descartar a opção de justificativa | Corrigido preservando a configuração existente; testes verdes |
| F5 | P2 | Histórico é retornado sem limite ou paginação | Corrigido com cursor e limite de 100; testes de contrato verdes |
| F6 | P2 condicional | Rota de histórico não valida acesso do usuário ao item/projeto | Decisão documentada: mantém política global atual e valida tipo/existência |
| F7 | P2 | Eventos/snapshots não são apresentados como comparação de alterações | Corrigido com diffs e snapshot PBI filtrado para campos permitidos; testes verdes |

## Etapa 0 — Baseline, contrato e mapa de impacto

**Trabalho**

1. Registrar os comandos de teste disponíveis em `backend/package.json` e `frontend/package.json`.
2. Ler schemas, migrations, rotas, serviços, repositórios, testes existentes e OpenAPI referentes a auditoria, qualidade, critérios e backlog.
3. Confirmar quais operações de critérios são suportadas pela API e quais papéis podem realizá-las.
4. Confirmar se hoje há autorização por projeto ou se usuários autenticados compartilham visibilidade global do backlog.
5. Capturar baseline dos testes/builds relevantes antes das alterações.

**Revisão interna da etapa**

- Não presumir acesso baseado apenas em UUID; identificar middleware e política efetiva.
- Conferir se o baseline falha antes de alterar qualquer código e registrar falhas preexistentes separadamente.
- Não prosseguir com F6 até estabelecer a regra de autorização esperada.

**Saída/gate**

- Mapa de arquivos e contratos afetados, comandos de verificação e política de autorização documentados neste plano ou no PR.
- Nenhum arquivo de produção alterado nesta etapa.

## Etapa 1 — F1: justificativa em alterações de critérios

**Implementação prevista**

1. Definir contrato único para enviar justificativa nas operações de criação, exclusão e reordenação de critérios quando a entidade estiver concluída e a configuração exigir justificativa.
2. Obter e validar status/configuração dentro da transação que altera o critério, sob o mecanismo de lock usado pelo backlog.
3. Gravar o evento de auditoria com a justificativa na mesma transação da alteração; rollback deve desfazer ambos.
4. Atualizar `CriteriaEditor` para pedir justificativa apenas quando aplicável, preservar o texto em erro e focar o campo inválido.
5. Evitar duplicar regras divergentes entre épico, feature e PBI; extrair helper somente se reduzir duplicação sem obscurecer a regra.

**Testes**

- Criar, excluir e reordenar critérios em épico, feature e PBI concluídos: sem justificativa rejeita; com justificativa atualiza e audita.
- Configuração desativada: operações continuam permitidas sem justificativa.
- Rascunho/ativo: comportamento existente é preservado.
- Item/projeto arquivado e usuário sem permissão continuam bloqueados.
- Falha ao gravar auditoria causa rollback da mutação.
- UI exibe validação acessível e não perde justificativa digitada após erro.

**Revisão interna da etapa**

- Procurar qualquer endpoint alternativo/compatível que altere critérios sem passar pela política.
- Verificar que ação de reordenar não deixa ordens duplicadas ou lacunas em sucesso/rollback.
- Inspecionar dados de auditoria: não armazenar conteúdo desnecessário além da justificativa e metadados já acordados.

**Gate**

- Testes novos de serviço/repositório/rota e UI passam; revisão do diff confirma cobertura das três operações e três entidades.

## Etapa 2 — F2: validação atômica contra concorrência

**Implementação prevista**

1. Fazer com que a transação de update leia a versão atual do item sob lock e decida ali se a justificativa é obrigatória.
2. Fazer a configuração ser lida de maneira consistente com a política no ponto de gravação, evitando usar a resposta prévia do serviço como autoridade final.
3. Manter validações rápidas no serviço para boa mensagem ao usuário, mas considerar a validação transacional a fonte de verdade.
4. Aplicar o mesmo desenho a épico, feature e PBI, sem retirar regras adicionais existentes (campos obrigatórios, arquivamento, projeto ativo).

**Testes**

- Reproduzir disputa entre `concluir` e `atualizar`: se conclusão confirmar primeiro, update sem justificativa deve ser rejeitado.
- Testar o caso inverso: update precede conclusão e mantém resultado coerente.
- Cobrir as três entidades e provar que atualização e auditoria não ficam parcialmente aplicadas.

**Revisão interna da etapa**

- Examinar ordem de locks para prevenir deadlocks com arquivamento, conclusão e edição.
- Confirmar que leituras feitas dentro da transação usam a mesma conexão (`client`), não o pool global.
- Verificar rollback/release em todos os caminhos, inclusive erro de validação.

**Gate**

- Teste concorrente determinístico (barreiras/promises ou fixture apropriada, sem sleeps frágeis) reproduz a janela e passa após a correção.

## Etapa 3 — F4: persistência ponta a ponta da configuração

**Implementação prevista**

1. Seguir o campo `exigir_justificativa_item_concluido` do banco à resposta da API, tipos/parse do frontend e payload de atualização.
2. Garantir que uma gravação parcial não apague a opção já persistida; decidir entre preservar campos omitidos ou exigir o objeto completo, conforme contrato existente.
3. Se a configuração possuir UI de edição, expor a opção com rótulo/descrição explícitos e estado carregando/erro/salvo. Se não houver UI prevista, garantir preservação no cliente que salva a configuração e documentar como a opção é administrada.
4. Fazer a UI de backlog seguir a configuração retornada pela API em vez de exigir justificativa incondicionalmente.

**Testes**

- GET → PUT sem alterar a opção preserva ligado e desligado.
- GET → alterar outros campos → salvar → GET mantém o estado da política.
- Política ligada/desligada afeta edição e critérios na UI e servidor.
- Campo ausente tem semântica explícita e compatível com dados já existentes.

**Revisão interna da etapa**

- Conferir defaults de migration, configuração inicial, dados existentes e fallback de versões antigas do cliente.
- Confirmar que validação não permite tipos inválidos ou estado ambíguo.

**Gate**

- Testes de repositório/controller/API e frontend demonstram preservação após salvar e recarregar.

## Etapa 4 — F3: estados de carregamento do histórico

**Implementação prevista**

1. Modelar explicitamente estados `loading`, `error` e `success` (com lista vazia ou preenchida), sem inferir erro como lista vazia.
2. Exibir mensagem curta e acionável; incluir botão “Tentar novamente” com proteção para chamadas em andamento.
3. Preservar cancelamento com `AbortController` e impedir atualização de estado após desmontagem.
4. Manter estado vazio somente quando a API responder sucesso com zero registros.

**Testes**

- Resposta 200 vazia → estado vazio.
- Erro HTTP, falha de rede e exceção síncrona → estado de erro.
- Retry bem-sucedido → lista renderiza.
- Troca rápida de entidade/desmontagem → resposta cancelada não sobrescreve a tela atual.
- Acessibilidade: região de status/alerta e controle de retry navegáveis por teclado.

**Revisão interna da etapa**

- Confirmar que erros não apagam o último histórico válido sem motivo e que não se mostra informação antiga como se fosse atual.
- Verificar mensagens sem expor detalhes internos da API.

**Gate**

- Testes de componente para vazio, erro, retry e cancelamento passam.

## Etapa 5 — F5: limite/paginação do endpoint de auditoria

**Implementação prevista**

1. Definir contrato retrocompatível de paginação (preferir cursor ou `limit`/`offset` limitado, com ordenação estável por `created_at` e `id`).
2. Validar e limitar valores no servidor; nunca interpolar valores não validados no SQL.
3. Atualizar cliente e componente para carregar páginas adicionais sem perder estados de erro/vazio.
4. Avaliar índice composto que suporte filtro por entidade e ordenação; adicionar migration somente se plano/consulta mostrar necessidade e respeitar padrão do repositório.

**Testes**

- Valores padrão, mínimo, máximo, inválidos e consulta sem resultados.
- Duas páginas sem repetição/perda quando há timestamps iguais.
- Ordem determinística e contagem/indicador de continuidade corretos.
- Confirmar plano de consulta/índice com volume representativo ou justificar índice existente.

**Revisão interna da etapa**

- Definir compatibilidade para consumidores existentes e payload de resposta.
- Evitar N+1 no nome do autor; preservar query única/eficiente.

**Gate**

- Contrato API e UI aprovados; testes cobrem volume e paginação determinística.

## Etapa 6 — F6: autorização do histórico, condicionada ao contrato de produto

**Decisão inicial obrigatória**

- Se o produto possui visibilidade global para todos os usuários autenticados, registrar essa decisão e restringir/validar tipos de entidade, UUID e existência para evitar consultas ambíguas.
- Se há isolamento por projeto/papel, exigir autorização para ler o item antes de buscar eventos, seguindo o mesmo guard usado nos endpoints de leitura do backlog.

**Testes quando isolamento for exigido**

- Usuário permitido lê histórico.
- Usuário sem acesso recebe resposta sem dados (404/403 conforme padrão existente).
- IDs válidos de outro projeto não revelam autor, justificativa, existência ou volume de alterações.
- Tipos desconhecidos são rejeitados com erro de validação.

**Revisão interna da etapa**

- Comparar resposta com a política dos endpoints de detalhe, não inventar regra nova para auditoria.
- Garantir que mensagens e códigos não permitam enumeração de itens.

**Gate**

- Política documentada e cobertura de autorização alinhada aos endpoints existentes.

## Etapa 7 — F7: utilidade do histórico e snapshots

**Implementação prevista após confirmar escopo**

1. Comparar o requisito S1-24 e a UI esperada: histórico deve ser apenas trilha de ator/data/ação/justificativa ou deve mostrar campos alterados e valores anterior/novo?
2. Verificar o formato já persistido em `dados_json` e `pbi_versao`; não migrar estrutura antes de confirmar consumidores/compatibilidade.
3. Se precisa reconstrução/diff, expor representação segura e tipada dos campos alterados e renderizar comparação na tela; não despejar JSON bruto.
4. Definir política de retenção/exclusão coerente com auditoria e LGPD antes de oferecer snapshots completos.

**Testes**

- Alteração de cada tipo de entidade mostra campos corretos e valores legíveis.
- Rascunhos sem justificativa são diferenciados de registros antigos sem dado.
- Snapshot/versionamento não vaza campos ou dados removidos que não deveriam ser exibidos.

**Revisão interna da etapa**

- Confirmar requisito com backlog/PR antes de ampliar escopo.
- Garantir que uma versão antiga do evento continue renderizável.

**Gate**

- Escopo de auditoria confirmado e formato versionado/documentado antes de alterar payload persistido.

## Etapa 8 — Verificação integrada e entrega

**Execução**

1. Rodar testes focados de cada fatia.
2. Rodar suíte completa e typecheck do backend; suíte/build/testes relevantes do frontend.
3. Rodar verificações de integração com PostgreSQL disponíveis na CI, especialmente transações, constraints e migration.
4. Revisar diff completo contra `main`, executar `git diff --check`, conferir migration reversível/idempotente conforme padrão do projeto, e procurar rotas/UI alternativas não cobertas.
5. Confirmar CI verde na PR atualizada, sem conflitos com `main`.

**Checklist final de revisão QA**

- [x] Política de justificativa respeitada para updates e mudanças de critérios em épico, feature e PBI (unitários verdes; DB integration adicionada).
- [x] Configuração ligada/desligada permanece correta após salvar e recarregar (testes de merge/preservação).
- [x] Concorrência não permite bypass nem gravação parcial (teste PostgreSQL dedicado passou na CI).
- [x] Histórico distingue vazio de indisponível e suporta retry (testes frontend verdes).
- [x] Paginação tem limite máximo, ordenação estável e contrato compatível (backend/frontend verdes).
- [x] Autorização do histórico coincide com a política de projeto existente (decisão documentada e validação de tipo/existência).
- [x] Eventos e versões atendem ao escopo acordado e podem ser interpretados pela UI (snapshot filtrado, sem expor propriedades internas).
- [x] Builds, testes, typechecks, integração e CI passam (backend, frontend e todos os checks PostgreSQL passaram na CI).
- [x] Diff não contém alterações locais estranhas, segredos, artefatos ou whitespace acidental (revisão local; `git diff --check` sem erros).
- [x] Nenhum merge realizado; correções publicadas e nova revisão solicitada na PR.

## Ordem e dependências

`Etapa 0 → F1 → F2 → F4 → F3 → F5 → F6 (decisão) → F7 (escopo) → Etapa 8`

F1 e F2 formam a integridade da regra e devem preceder ajustes visuais. F4 garante que o frontend e servidor usem a mesma política. F3 é independente e pode ser desenvolvida após a estabilização do contrato de erro. F5 depende da definição do payload do histórico. F6/F7 exigem decisão/contrato explícitos para não expandir escopo sem base.

## Critério de conclusão

O trabalho termina quando todos os achados confirmados estiverem corrigidos e testados; os riscos condicionais tiverem decisão registrada; a revisão do diff não apontar regressão; e a CI da PR estiver verde. Merge permanece fora do escopo.
