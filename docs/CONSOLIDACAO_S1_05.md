# Execução da consolidação S1-05

Base: main da59fcc. Branch: codex/consolidate-s105. Início: 18/09/2026.

## Decisões antes da execução

- Manter `modules/epics` e `frontend/src/backlog`: já sustentam features, PBIs e critérios do PR #21.
- Retirar `modules/epicos` (service, repository, controller, types e testes duplicados), EpicPanel e seu cliente exclusivo após transferir cenários úteis.
- Preservar URLs antigas em um adaptador `epics/epics.compat.routes.ts`, sem SQL nem regra de negócio própria. Consumidores externos não são conhecidos, portanto não remover URLs abruptamente.
- Toda escrita usa o service canônico, erros compartilhados, req.auth e auditoria transacional. Criação resulta em rascunho; conclusão exige os campos do guia e critérios. PATCH genérico não muda status.
- Preservar estados legados ativo/arquivado nos dados existentes, como registros somente leitura até decisão explícita de migração pelo produto. Nenhuma conversão silenciosa de dados. Novas escritas só criam rascunhos e concluem pelo endpoint dedicado.
- Preservar migrations já publicadas; adicionar preparação antes da 005 e reconciliação posterior. Banco novo e bancos com históricos diferentes devem convergir sem apagar registros.
- Evitar incorporar as quatro novas tasks do #22 à correção de duplicidade. Preparar e verificar a aplicação apenas do delta do #22 sobre esta base; não reescrever a branch de outro desenvolvedor.
- Preservar mudanças locais no checkout original. Execução em worktree separado.

## Etapas e evidências

- [x] 1. Atualizar referências, isolar branch e registrar decisões antes de editar.
- [x] 2. Criar regressões de contrato: URLs antigas e novas, autenticação, autoria, erros, conclusão e listagem completa.
- [x] 3. Unificar backend e remover implementação duplicada; proteger escritas de épicos em registros legados e projetos arquivados.
- [x] 4. Consolidar frontend, transferir testes e remover arquivos órfãos.
- [x] 5. Reconciliar migrations e validar trajetórias em PostgreSQL isolado.
- [x] 6. Documentar contrato/compatibilidade e orientação de integração do #22.
- [x] 7. Executar testes, build, revisão do diff e registrar resultados finais.

## Critérios de conclusão

Um módulo de negócio de épicos; nenhuma referência à implementação removida; aliases sem regras próprias; erros 400/404 corretos; autoria preservada; auditoria com rollback; criação/conclusão equivalentes; migrations repetíveis e sem perda de dados; frontend usando somente backlog; diff revisável com checklist atualizado. Integração na main permanece via revisão de PR.

## Registro de execução

- Removidos nove arquivos: seis do módulo epicos e três da interface/cliente EpicPanel.
- Compatibilidade mantida em epics.compat.routes.ts: array completo, priorizacao, missing_fields e details.missing. O PATCH antigo deixa de aceitar status; cliente deve chamar /complete. Essa quebra intencional impede contornar a validação canônica.
- Classes de erro e auditoria duplicadas foram eliminadas junto ao módulo; identidade vem de req.auth, e todas as escritas usam EpicsRepository.
- Criação aceita somente status ausente/rascunho. Atualização não aceita status. Épico concluído não pode perder os campos textuais obrigatórios. Projetos arquivados e estados legados impedem edição/conclusão de épicos.
- Transferidos cenários de vazio, carregamento, erro, título obrigatório, conclusão e leitura para a tela canônica. Corrigida a exposição do botão de conclusão para perfil de leitura.
- Backend: typecheck aprovado; 100 testes aprovados, um teste de seed ignorado. Frontend: 55 testes aprovados e build de produção aprovado.
- Docker local indisponível. A validação foi executada no CI em PostgreSQL 16 com pgvector: quatro trajetórias aprovadas (empty, legacy, backlog, both), repetição de migrations, preservação de IDs/estado legado e rollback de auditoria em criação, edição e conclusão. [Execução aprovada](https://github.com/Galaticos-API/API-4/actions/runs/35361555426).
- Todos os cinco checks do [CI geral](https://github.com/Galaticos-API/API-4/actions/runs/35361555294) passaram, incluindo seed em PostgreSQL, build/testes de backend e frontend, serviço de IA e configuração Docker.
- Revisão local concluída: YAML válido, diff sem erros de whitespace, nenhuma referência de código à implementação removida, checkout original preservado. A main continuava ancestral desta branch na conferência final. [PR #23](https://github.com/Galaticos-API/API-4/pull/23) contém a correção; revisão humana e merge ainda não realizados.

## Migrations: aplicação e recuperação

As duas migrations 005 publicadas permanecem intactas. O runner usa nome completo e ordem lexical, portanto executa a nova 004_z antes da 005 pendente, mesmo se 005_epico_guia_fields já estiver no histórico. A 004_z prepara ordem dos critérios antes do índice único, preservando IDs e textos; não reordena entidades que já têm ordens distintas e não nulas. A 006 torna a constraint de estados igual em todos os históricos, preservando valores legados.

Antes de aplicar em ambiente compartilhado: backup verificado; inventário de _schema_migrations, estados de epico e critérios; rodar a validação em cópia do banco; janela sem escritas; npm run migrate no backend; conferir constraints e histórico. Não apagar entradas nem renumerar migrations aplicadas. Em falha, interromper a aplicação e analisar o rollback; se necessário, restaurar o backup antes de liberar escrita. As novas migrations não alteram o runner nem as mudanças locais preexistentes no checkout original.

## Integração com PR #22

Base observada: bd1cfbd → 31ea49c na branch atual do #22. Para reaproveitar o trabalho sem repetir o #21, partir desta consolidação e portar apenas o delta bd1cfbd..31ea49c. Não fazer merge cego da branch antiga nem cherry-pick do commit bd1cfbd.

Pontos de reconciliação manual: manter canCreate de EpicDetail, estados legados de EpicResponse/Epic, validação explícita de status e ensureWritable de EpicsService; adicionar a edição, critérios e qualidade do #22 sobre isso. Manter o adaptador e seus testes. A declaração de create/update do #22 deve preservar os campos de segurança adicionados aqui. Resolver OpenAPI pela combinação dos endpoints novos com os aliases depreciados; não substituir o arquivo inteiro.

Esta correção não incorpora S1-11/12/13. A proteção geral de arquivamento para features/PBIs/critérios e a regra de remoção do último critério de item concluído devem ser verificadas no PR de hierarquia/S1-08; não são declaradas corrigidas por esta consolidação de épicos. A branch de Vitor não foi reescrita.

### Ensaio executado

Sobre e1e222d, em checkout descartável e sem publicar mudanças, `git cherry-pick --no-commit 31ea49c` deixou conflitos textuais somente em `frontend/src/backlog/Backlog.tsx` e `frontend/src/backlog/Epics.tsx`. São duas reconciliações em vez dos 29 conflitos de um merge direto da branch antiga. O ensaio foi desfeito depois da inspeção.

Resolução indicada: adotar a prop canEdit do #22, preservando a checagem de permissão no botão concluir e atualizando Epics.test.tsx; manter formulários/CriteriaEditor novos, estendendo readOnly para estados legados. O auto-merge do backend acrescenta assertProjetoAtivo além de ensureWritable: unificar a checagem de projeto arquivado e escolher um único código HTTP, preservando a proteção de estados legados. Os testes do #22 esperam 409 para arquivado, enquanto esta compatibilidade documenta 400; decidir e atualizar contratos/testes juntos. Ausência de conflito textual não dispensa essa revisão semântica. A versão combinada do #22 não foi validada nem declarada pronta.
