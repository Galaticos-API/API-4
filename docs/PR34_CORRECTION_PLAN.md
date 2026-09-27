# Plano de correção — PR #34 (S1-19, S1-20, S1-22)

## Fechamento dos gates (2026-09-25, segunda rodada)

Validação executada localmente com PostgreSQL real (instância descartável), backend real e Chrome:

| Gate | Resultado | Evidência |
|---|---|---|
| 1. Testes de abas do projeto | Concluído | `frontend/src/views/projects/ProjectTabs.test.tsx`: papéis ARIA, clique, setas/Home/End, hash, rota `/documents`, arquivado e perfil de leitura |
| 2. Testes do RepoAnalyzer | Concluído | `RepoAnalyzerView.test.tsx` e `models/repoAnalyzer.test.ts`; comportamentos do contrato anterior preservados e ampliados (etapas, polling, erro, URL, repetição, relatório) |
| 3. Testes da tela de documentos | Concluído | `DocumentsView.test.tsx` (19): upload binário, limite, vazio/erro/retry, cursor, remoção, permissões, arquivado, armazenamento pendente e aviso da S2-01 |
| 4. OpenAPI/documentação | Concluído | `cursor`, `limit`, `next_cursor`, `paginacao`, `armazenamento_pendente`, 409; `pendente` = aguardando ingestão; `docs/DOCUMENTOS_INTEGRACAO.md` |
| 5. Migration 012 | Concluído | `backend/src/database/migration-012.db.test.ts`: banco limpo e banco na 011, idempotência, dados legados, ordem do runner |
| 6. CI | Concluído | Etapa de PostgreSQL agora executa também backlog-tree, migrations 011/012, documentos e chat; nenhum job removido |
| 7. PostgreSQL | Concluído | 41+ testes de banco: corrida arquivamento x upload/DELETE, lease/backoff/SKIP LOCKED, operações de armazenamento, paginação estável e isolada |
| 8. Worker/n8n | Concluído no escopo | Worker independente de DELETE; `/health` expõe filas e alertas; consumidor n8n documentado com exemplo importável; workflow definitivo fica como pendência de integração (dependência da instância n8n e da S2-01) |
| 9. Navegador | Concluído | `e2e/` (12 cenários): perfis PO/dev, ativo/arquivado, upload válido/inválido/limite, remoção com confirmação e Esc, paginação, teclado, mobile 390 px sem overflow horizontal |
| 10. Suítes completas | Concluído | Backend 270+ testes e build; frontend 168+ testes, `tsc -b` e build |

### Falhas do CI corrigidas
- `documents.repository.db.test.ts:91`: o teste assumia fila sem lease/backoff. Reescrito para provar lease, backoff, retorno da fila, expiração de lease e publicação.
- 9 testes do frontend: as suítes apontavam para telas legadas. Portadas para as views atuais; componentes órfãos (`DocumentsTab`, `RepoAnalyzerTab`) removidos.

### Achados adicionais tratados nesta rodada
- Chat: qualquer usuário autenticado lia/escrevia em conversas alheias e o fallback devolvia trechos de todos os projetos sem relação com a pergunta. Corrigido (posse, isolamento, busca textual honesta com origem).
- Cadastro público aceitava `role: "admin"`. Agora exige sessão de administrador.
- RepoAnalyzer (API): validação de UUID, projeto inexistente (404), arquivado (409), erro do motor (503) e sincronização concorrente.
- Interface: tokens unificados com o protótipo (uma cor de marca), variáveis CSS órfãs corrigidas, responsivo do cabeçalho/abas.

### Pendências explícitas (não bloqueiam a PR)
- Workflow n8n definitivo de `document.removed` e `DOCUMENT_EVENTS_WEBHOOK_URL`.
- Ingestão/indexação (S2-01).
- CI do GitHub no HEAD publicado e nova revisão QA. Merge só com autorização separada.

## Estado e limites

- PR: https://github.com/Galaticos-API/API-4/pull/34
- Autor: `vitorpdim` (Victor Hugo)
- Commit revisado: `5cb8b2e706527495ca993954470252217574f062`
- Base atual observada: `main` em `d636620957a7cf62d95a4894bd4f2d75b412eac5`
- Estado observado no início: PR aberta, `CONFLICTING`; checks do commit da PR
  antecedem a integração da main atual.
- Atualização em 2026-09-25: main integrada localmente por merge normal na branch
  `codex/pr34-corrections`; conflitos resolvidos sem restaurar telas antigas. O
  merge e as correções foram validados parcialmente, mas ainda não estão prontos
  para merge na main.
- Não fazer merge desta PR até concluir os gates ao final deste documento e
  confirmar CI verde no HEAD atualizado.
- CI do commit `9b4e445` concluiu parcialmente com falha: o teste PostgreSQL do
  outbox falhou em `documents.repository.db.test.ts:91` ao verificar que o evento
  deixa de aparecer após publicação; os testes do frontend falharam em 9 casos
  nas suítes de abas e RepoAnalyzer (views atuais não têm o papel acessível
  esperado pelas abas e o contrato visual/testado do Analyzer divergiu).

## Ponto de parada e validação atual (2026-09-25)

- Backend: `npm run build` passou; `npm test`: 207 passaram, 0 falharam e 9
  testes PostgreSQL foram pulados por falta de `ARCHIVE_TEST_DATABASE_URL`.
- Frontend: `npm run build` passou; `npm test`: 123 passaram e 9 falharam em
  `ProjectTabs.test.tsx` e `RepoAnalyzerTab.test.tsx`, cujas expectativas ainda
  correspondem à implementação antiga e precisam ser atualizadas ou a
  funcionalidade correspondente precisa ser restaurada na arquitetura atual.
- CI no GitHub confirmou os bloqueios: além dos 9 testes frontend, o teste real
  PostgreSQL `outbox: pendente aparece na fila e some depois de publicado` falha
  na asserção de `documents.repository.db.test.ts:91`. Os testes concorrentes de
  arquivamento/upload e arquivamento/DELETE passaram. O check de validação de
  workflow/Docker e o build/typecheck do backend passaram; o estado do serviço
  de IA estava em execução na última consulta.
- A migração de documentos foi renomeada para `012_document_upload.sql`, mas
  falta teste PostgreSQL que prove aplicação em banco limpo e banco existente
  após `011_unique_entity_technology.sql`.
- A rota segura de documentos está montada somente sob
  `/api/v1/projects/:projectId/documents`; a rota legada permissiva foi removida.
- A checagem de projeto arquivado foi movida para transações serializadas; há
  testes DB de concorrência preparados, ainda não executados localmente.
- Worker de retentativa/reconciliação e paginação por cursor foram iniciados;
  contrato OpenAPI, tela ativa e testes completos ainda exigem revisão integrada.
- Esta atualização é um checkpoint de trabalho para a PR, não uma aprovação de
  QA nem autorização de merge.

## Próximas etapas obrigatórias antes do merge

1. Atualizar os testes de navegação das abas de projeto para o comportamento
   acessível da view vigente; cobrir clique/teclado, hash/URL, documentos em
   projeto ativo e arquivado, sem quebrar o backlog e o RepoAnalyzer.
2. Atualizar e completar os testes do RepoAnalyzer na arquitetura atual, ou
   recuperar as interações do contrato anterior que ainda forem requisito; não
   remover testes apenas para fazer a suíte passar.
3. Acrescentar testes da nova `DocumentsView` para upload binário, limite e
   validação, lista vazia/erro/tentar novamente, cursor/carregar mais, remoção,
   roles, projeto arquivado, falha de armazenamento e aviso honesto de que a
   ingestão depende da S2-01.
4. Atualizar fixtures/contratos de API e documentação OpenAPI para `cursor`,
   `next_cursor`, `paginacao`, `armazenamento_pendente` e conflito HTTP 409;
   descrever `pendente` como aguardando ingestão, sem prometer indexação.
5. Criar teste PostgreSQL para `012_document_upload.sql` em schema limpo e em
   schema com `011_unique_entity_technology.sql` já aplicada; provar idempotência,
   preservação de dados e ordem do runner.
6. Configurar CI para executar os testes de documentos, concorrência e migrações
   junto dos testes atuais da main, sem retirar nenhum job existente.
7. Executar os testes PostgreSQL em banco descartável; comprovar corrida entre
   arquivamento e upload/remoção, lease/retentativa do outbox, reparação de
   storage e paginação estável sem vazamento entre projetos.
8. Revisar o worker e o escopo da integração n8n: verificar execução independente
   de DELETE, idempotência, backoff, logs sanitizados, health/alerta e definir
   claramente o que fica como dependência da S2-01 versus o que esta PR entrega.
9. Revisar UX e acessibilidade no navegador em desktop/mobile, perfis admin/PO/dev,
   projeto ativo/arquivado, uploads válidos/inválidos, navegação e estados de
   erro/recuperação; garantir que a rota atual renderize a tela de documentos.
10. Executar build/typecheck e testes backend/frontend completos, validação de
    OpenAPI/workflows e `git diff --check`; corrigir todas as falhas e revisar o
    diff contra a main para evitar regressões de autenticação, backlog, chat,
    projetos, RepoAnalyzer ou documentação.
11. Confirmar que a branch da PR contém o HEAD mais recente da main sem conflitos,
    aguardar CI verde no commit exato publicado e solicitar nova revisão QA/autor.
12. Só então considerar merge, mediante autorização explícita separada. Este
    checkpoint não autoriza merge.

O trabalho deve preservar a arquitetura e as regras da main atual. Como Vitor é
autor da PR, alterações na branch compartilhada devem ser coordenadas com ele;
não fazer force-push nem substituir arquivos atuais por cópias antigas da PR.

## Achados que o plano cobre

1. Bloqueio de integração com a main: conflitos em `.github/workflows/ci.yml`,
   `backend/src/modules/documents/documents.routes.ts`,
   `docs/S1-28_FRONTEND_HANDOFF.md`, `frontend/src/App.tsx`,
   `frontend/src/components/DeveloperDashboard.tsx`,
   `frontend/src/components/LandingPageView.tsx`,
   `frontend/src/components/ui/index.tsx`, `frontend/src/projects/Projects.tsx`,
   `frontend/src/projects/RepoAnalyzerTab.tsx` e
   `frontend/src/projects/projects.css`.
2. A remoção não revalida nem bloqueia um projeto arquivado no backend.
3. O status do projeto é verificado antes do upload, fora do lock/transação que
   serializa o arquivamento; há uma corrida que pode gravar em projeto arquivado.
4. O upload grava metadados como `pendente`, mas não aciona processamento; a
   interface diz que ele começará. O workflow de ingestão disponível espera
   `text_content` e está inativo.
5. O dispatcher da outbox só é chamado durante uma requisição DELETE. Eventos
   que falham podem ficar sem nova tentativa se não houver outra remoção. O
   handoff da PR registra que o consumidor n8n ainda precisa ser criado.
6. Arquivo e banco não formam uma única transação; falhas/queda entre gravação,
   rename, commit, restore e discard podem deixar conteúdo órfão ou inacessível.
7. A listagem não tem paginação e retorna todos os documentos do projeto.

## Princípios de implementação

- Fazer uma etapa por vez; ao fim de cada etapa, revisar o diff e executar os
  testes daquele comportamento antes de avançar.
- Usar a main atual como fonte de verdade para rotas, autenticação, navegação,
  componentes e contratos já publicados.
- Manter isolamento por projeto, autorização por perfil, auditoria e idempotência.
- Não registrar conteúdo de arquivos, tokens, URLs sensíveis ou SQL com dados em
  logs de erro.
- Não declarar o processamento completo enquanto não houver um fluxo ativo que
  consuma o arquivo e atualize seu status.
- Nenhum merge da PR está incluído neste plano.

## Etapa 0 — Preparação e decisões de escopo

### Planejamento interno revisado

Antes de alterar código, confirmar o commit exato da PR e da main, verificar que
o worktree isolado está limpo e manter intactos os checkouts com trabalho local.
Conferir no Trello/backlog se S1-21 (ingestão/indexação) é dependência separada
ou parte do aceite desta PR. Esta decisão muda o escopo da implementação e não
deve ser presumida.

### Ações

1. Revalidar o diff e os conflitos usando os SHAs atuais; atualizar a lista de
   arquivos conflitantes se a PR ou a main tiverem avançado.
2. Confirmar os critérios de aceite das S1-19, S1-20 e S1-22 e o estado
   do fluxo n8n de ingestão e remoção.
3. Definir um contrato observável para status: quando fica `pendente`, quando
   muda para `processando`, `processado` ou `falha`, e quem executa cada mudança.
4. Definir limite e formato da paginação de documentos (recomendação inicial:
   cursor estável por `created_at, id`, limite máximo configurado no servidor).

### Gate de saída

Escopo da ingestão documentado; volume esperado de documentos esclarecido;
branch/worktree e SHAs anotados; nenhuma escrita ainda feita na PR.

## Etapa 1 — Integrar a main sem regressões

### Planejamento interno revisado

O diff da PR antecede a migração para as views atuais. Resolver conflitos
preservando telas e rotas da main; portar as capacidades de documentos para a
arquitetura presente em vez de restaurar `Projects.tsx` ou componentes antigos.
No backend, a main já tem uma rota legada de documentos que grava metadados
forjáveis e cria um chunk fictício; a versão segura deve substituí-la como única
implementação, sem manter rotas duplicadas ou caminhos alternativos permissivos.

### Ações

1. Integrar a main à branch da PR por merge normal, sem reescrever commits nem
   usar force-push. Coordenar a atualização da branch compartilhada com o autor.
2. Resolver `.github/workflows/ci.yml` conservando os jobs existentes e
   acrescentando as verificações específicas de documentos sem remover testes
   da main.
3. Unificar `documents.routes.ts`: manter autenticação global, roles corretas,
   escopo de projeto e corpo binário/validação; remover o POST legado que aceita
   `caminho`, `mime` e status enviados pelo cliente e o DELETE não escopado por
   projeto.
4. Portar a aba `DocumentsTab` para a view e navegação de projetos da main,
   conservando backlog, chat, autenticação, RepoAnalyzer e design system atuais.
5. Atualizar OpenAPI, handoff e testes para um só contrato canônico.
6. Revisar migrações: a main já contém `011_unique_entity_technology.sql` e a PR
   adiciona `011_document_upload.sql`. Embora o runner use o nome completo do
   arquivo como chave e não haja colisão literal, manter a sequência inequívoca
   (recomendação: nomear a nova migração `012_document_upload.sql`) e atualizar
   caminho/nome nos testes e documentação.

### Testes e gate

- Build e testes de frontend/backend passam após os conflitos.
- A rota antiga não permite criar documentos fictícios, forjar caminhos ou
  remover documento sem o `projectId` correspondente.
- Projeto, backlog, RepoAnalyzer, chat e autenticação continuam acessíveis.
- Migration runner passa em banco limpo e em banco já migrado até a main atual.
- Diff revisto para garantir que não houve remoção acidental de comportamento
  recente da main.

## Etapa 2 — Tornar arquivamento uma regra atômica para documentos

### Planejamento interno revisado

Uma checagem feita só em `DocumentsService` não fecha a corrida: arquivamento
pode ocorrer depois da leitura do status. Usar o lock e a política existentes
(`lockHierarchy` e `assertWritable`) na mesma transação que grava/remove
metadados. A checagem antecipada pode permanecer para resposta rápida, mas a
decisão final é do banco sob lock. A operação de filesystem deve ser compensada
se a transação final rejeitar por arquivamento.

### Ações

1. Upload: validar projeto e conteúdo; armazenar temporariamente; no repositório,
   abrir transação, adquirir lock de hierarquia, revalidar projeto ativo e criar
   metadados/auditoria. Se projeto estiver arquivado, reverter e limpar o arquivo
   temporário.
2. Remoção: validar documento/projeto; preparar o arquivo para remoção; no mesmo
   fluxo transacional, adquirir lock, confirmar que o projeto está gravável,
   remover metadados/chunks e gravar auditoria/outbox. Se for arquivado ou houver
   erro, restaurar o arquivo e retornar conflito apropriado.
3. Reutilizar o erro de conflito de arquivamento da main (HTTP 409) em vez de
   classificar regra de negócio como erro genérico de validação.
4. Garantir que falha ao remover o documento não gere evento de remoção.

### Testes e gate

- Projeto arquivado: upload e DELETE retornam 409; metadados, chunks e arquivo
  permanecem; auditoria/outbox não registram remoção.
- Projeto ativo: upload e remoção continuam funcionais e isolados por projeto.
- Teste de concorrência usa barreiras/locks para reproduzir archive-vs-upload e
  archive-vs-delete; nenhum resultado final pode modificar projeto arquivado.
- Erro durante transação desfaz banco e aciona compensação de filesystem.

## Etapa 3 — Resolver o contrato de ingestão e status

### Planejamento interno revisado

O backlog versionado esclarece a divisão: S1-19 cobre upload seguro, S1-20
exibição/status, S1-22 remoção consistente; S1-21 trata de protótipos associados
a PBIs. O processamento em segundo plano é S2-01. Portanto, não implementar
ingestão/indexação neste escopo nem atribuí-la à S1-21. A UI deve manter o status
real `pendente` e informar que o arquivo foi armazenado e aguarda a integração
de ingestão; a entrega da S2-01 permanece explicitamente pendente.

### Caminho aplicado: ingestão permanece na S2-01

1. Ajustar aviso de sucesso para informar armazenamento/recebimento e deixar
   claro que o processamento depende da integração de ingestão.
2. Manter status `pendente` como estado real, explicando-o na UI e no OpenAPI.
3. Registrar dependência explícita para S2-01 e que documentos
   ainda não estão disponíveis na busca/conversa até essa integração.

### Fora do escopo desta correção (S2-01)

1. Criar contrato idempotente de `document.uploaded`/ingestão; não enviar o
   conteúdo integral dentro de eventos sem limite.
2. Tornar o arquivo acessível ao worker de modo autenticado e restrito ao
   documento/projeto (volume compartilhado ou endpoint interno com autorização).
3. Extrair texto dos formatos suportados, acionar o fluxo n8n/AI, e persistir
   transições de status e falhas; workflow deve estar ativado/configurado nos
   ambientes que declaram ingestão disponível.
4. Definir retentativa e deduplicação para não indexar duas vezes o mesmo
   documento após timeout/reentrega.

### Testes e gate

No caminho separado, a UI não afirma que iniciou indexação e o aceite mostra a
dependência. No caminho incluído, integração de ponta a ponta comprova upload →
worker → chunks vinculados ao projeto → status terminal, incluindo falhas e
retentativa.

## Etapa 4 — Outbox com entrega e retentativa independentes de DELETE

### Planejamento interno revisado

A tabela outbox só é confiável se um consumidor/drainer for executado sem uma
ação incidental do usuário. Entrega deve ser ao menos uma vez, com chave estável;
consumidor precisa ser idempotente. Evitar duas instâncias processarem o mesmo
evento simultaneamente e evitar tentativas infinitas sem observabilidade.

### Ações

1. Escolher e documentar o dispatcher (worker/cron ou consumidor n8n ativo), com
   configuração explícita e health/alerta quando webhook estiver vazio.
2. Reservar eventos em lote com estado/lease ou `FOR UPDATE SKIP LOCKED`; registrar
   tentativa, próxima tentativa e erro sanitizado, com backoff.
3. Continuar marcando `publicado` só após resposta de sucesso; manter falhas
   recuperáveis e usar a mesma `Idempotency-Key` em toda reentrega.
4. Retirar a responsabilidade de drenar outbox do caminho síncrono da requisição
   DELETE; a remoção deve ser concluída mesmo se consumidor estiver fora do ar.
5. Criar e ativar o consumidor n8n de `document.removed` se essa integração está
   no escopo; caso contrário, manter a pendência de integração explícita e não
   declarar sincronização externa completa.

### Testes e gate

- Falha de webhook deixa evento recuperável; worker publica depois sem novo
  DELETE do usuário.
- Resposta duplicada/retry com a mesma chave não repete efeito no consumidor.
- Duas instâncias não perdem nem processam indevidamente o evento em paralelo.
- Evento é criado na mesma transação que a remoção; rollback não deixa outbox.
- Métricas/logs sanitizados mostram idade da fila, tentativas e falhas.

## Etapa 5 — Recuperação para inconsistências de filesystem/banco

### Planejamento interno revisado

Banco e filesystem não compartilham commit atômico. Compensação em `catch` não
cobre queda abrupta nem falha da própria compensação. Definir um estado durável
de operação e uma rotina segura de reconciliação; nunca apagar automaticamente
um arquivo recente cujo vínculo possa estar em transição.

### Ações

1. Dar nome a arquivos temporários e registrar operações pendentes de upload e
   remoção no banco/outbox.
2. Após commit de upload, finalizar rename/estado; após falha, limpar ou marcar
   para reconciliação em vez de engolir erro.
3. Após commit de remoção, deixar limpeza física como operação idempotente
   pendente; retry remove `.removing` e marca concluído.
4. Se rollback ocorre e `restore()` falha, preservar diagnóstico/correlation
   id, marcar inconsistência reparável e informar que disponibilidade está em
   recuperação (não afirmar que arquivo continua disponível).
5. Criar tarefa de reconciliação com período de graça que compara arquivos e
   registros, lista órfãos para observação e só então os remove com regra segura.

### Testes e gate

Injetar falhas em save, create, stage, delete, restore e discard; simular
reinício entre cada fronteira; provar que cada caso termina consistente ou em
estado recuperável e observável, sem remover conteúdo vinculado por engano.

## Etapa 6 — Paginar lista de documentos

### Planejamento interno revisado

Os arquivos não vão na resposta de listagem, mas quantidade ilimitada de linhas
e renderização integral ainda podem degradar API e navegador. Usar ordenação
estável para impedir saltos/duplicatas entre páginas; manter UX acessível e
compatível com lista vazia, erro e atualização.

### Ações

1. Acrescentar paginação por cursor `(created_at, id)` e limite máximo no backend.
2. Retornar `items`, `next_cursor` e limites; atualizar OpenAPI e cliente tipado.
3. Adicionar “Carregar mais”/paginação responsiva na tela, sem descartar itens
   ao atualizar a página atual.
4. Manter isolamento por projeto na consulta e no cursor.

### Testes e gate

- Dataset acima de várias páginas, ordenação repetível, sem duplicata/perda;
  cursor inválido é rejeitado com erro seguro.
- Consulta de uma página não retorna registros de outro projeto.
- Navegação, empty state e retry continuam funcionais em desktop/mobile.

## Etapa 7 — QA de integração e liberação para nova revisão

### Revisão interna final

1. Revisar o diff completo contra a main mais recente; procurar contratos
   duplicados, autorização omitida, caminhos que aceitam metadados/caminho do
   cliente, dados sensíveis em logs e regressões das telas atuais.
2. Rodar migration em banco limpo e banco existente com `011_unique_entity_technology`
   já aplicada; confirmar ordem e idempotência do novo arquivo de migration.
3. Rodar testes unitários, testes de integração PostgreSQL, build/typecheck do
   backend, testes/build do frontend e validação do OpenAPI/workflows.
4. Validar browser: perfis `admin`, `po`, `dev`; projeto ativo e arquivado;
   upload válido/inválido, limite, listagem paginada, remoção, falha de rede e
   status de processamento conforme escopo decidido.
5. Publicar commits normais na branch da PR apenas após coordenação com o autor;
   aguardar CI do HEAD exato e confirmar que conflitos foram eliminados.
6. Pedir nova revisão QA/autor depois dos gates verdes. Merge fica fora deste
   plano e depende de autorização própria.

### Critério de conclusão

PR atualizada contra a main, sem conflitos; invariantes de projeto arquivado
protegidos sob concorrência; comportamento de ingestão coerente com o escopo;
outbox e armazenamento recuperáveis; listagem escalável; testes relevantes e CI
verde no commit final; sem regressões na main.
