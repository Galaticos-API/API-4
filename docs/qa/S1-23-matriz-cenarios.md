# S1-23 — Matriz de cenários dos fluxos Must da Sprint 1

Escopo: PBIs Must entregues até a S1-22 (mais S1-16, S1-17 e S1-18). Evidência = teste automatizado reproduzível
(`backend`, `frontend`, `e2e`). Resultado = última execução registrada em `docs/qa/S1-23-roteiro-review.md`.
"Responsável" é a área que entregou; nomes individuais ficam no quadro da sprint, não neste repositório.

Legenda de evidência: **B** = testes de backend (unidade/rotas), **DB** = testes com PostgreSQL real, **F** = testes de
frontend, **E2E** = navegador + API real + PostgreSQL (`e2e/tests/…`).

| PBI | Fluxo / cenário | Área | Evidência | Resultado |
|---|---|---|---|---|
| 01.1.1 Cadastrar projeto | Criar com sucesso, validar obrigatórios, nome duplicado (409), perfil dev bloqueado | Backend + Frontend | B `projects.service.test`, `projects.routes.test`; E2E `flows` "Projetos: formulário valida…" (a tela ativa é `ProjectsView`) | Aprovado |
| 01.1.2 Cadastrar épico | Criar por API e pela interface, título obrigatório, bloqueio em projeto arquivado | Backend + Frontend | B `epics.service.test`, `epics.routes.test`; E2E `hierarchy-ui` "Épico → feature → PBI…" | Aprovado |
| 01.1.3 Cadastrar feature | Criar sob épico, herança de projeto arquivado | Backend + Frontend | B `features.service.test`, `features.routes.test`; E2E `hierarchy-ui` | Aprovado |
| 01.1.4 Cadastrar PBI | Título com verbo, história obrigatória, código sequencial | Backend + Frontend | B `pbis.service.test`, `pbis.routes.test`; E2E `hierarchy-ui` | Aprovado |
| 01.1.5 Editar item | Edição, justificativa de item concluído (S1-24), histórico | Backend + Frontend | B `audit.justificativa.test`, `completed-item-policy.test`; DB `hierarchy-archive.db.test`; F `Justificativa.test` | Aprovado |
| 01.2.1 / 01.2.2 Critérios de épico e feature | Criar, ordenar, remover, texto obrigatório | Backend + Frontend | B `criteria.service.test`, `criteria.routes.test`; F `Justificativa.test` | Aprovado |
| 01.2.3 Cenário de PBI | DADO/QUANDO/ENTÃO obrigatórios; cenário melhora a completude | Backend + Frontend | B `criteria.service.test`; E2E `flows` "Hierarquia, critérios e qualidade…", `hierarchy-ui` | Aprovado |
| 01.3.1 / 01.3.2 / 01.3.3 Validações do PBI | Título infinitivo, história completa, formato dos cenários | Backend + Frontend | B `quality.rules.test`, `quality.service.test`, `quality.routes.test` | Aprovado |
| 01.3.5 Checklist de qualidade | Pontuação determinística e painel em tempo real | Backend + Frontend | B `quality.service.test`; E2E `flows` (score sobe com cenário), `hierarchy-ui` (painel) | Aprovado |
| 01.4.1 Navegar a árvore | Árvore expansível, breadcrumb navegável, estado vazio | Frontend + Backend | DB `projects.backlog-tree.db.test`; F `Hierarchy.test`; E2E `flows` "Hierarquia…" | Aprovado |
| 01.4.2 Filtrar e localizar (S1-16 + S1-17) | Filtros status/tecnologia persistidos; busca por título/descrição com trecho e caminho; interseção; isolamento; vazio com limpar; persistência na sessão | Frontend + Backend + Banco | B `backlog-search.*.test`; DB `backlog-search.db.test`; F `BacklogSearch.test`, `Hierarchy.test`; E2E `flows` "Busca S1-17…" | Aprovado |
| 01.5.1 Registrar decisão (S1-18) | Contexto, decisão, justificativa, alternativas, autor/data, qualquer nível; arquivado 409; dev 403 | Backend + Frontend + Banco | B `decisions.service.test`, `decisions.routes.test`; DB `decisions.db.test`, `migration-013.db.test`; F `DecisionsPanel.test`; E2E `flows` "Decisões S1-18…" | Aprovado |
| 01.5.2 Consultar decisões | Ordem cronológica, herança de projeto/épico/feature, descendentes não aparecem | Backend + Frontend | idem 01.5.1 | Aprovado |
| 02.1.1 Anexar documento (S1-19) | Formatos, tipo real, limite, isolamento, falha sem resíduo, auditoria, 409 arquivado | Backend + Segurança | B `documents.validation.test`, `documents.service.test`, `documents.routes.test`, `documents.storage.test`; DB `documents.repository.db.test`, `migration-012.db.test`; E2E `documents` | Aprovado |
| 02.1.2 Consultar documentos (S1-20) | Lista por projeto, estados, cursor, atualização | Frontend + Backend | F `DocumentsView.test`, `api_documents.test`; E2E `documents` | Aprovado |
| (S1-22) Remoção confirmada | Confirmação, idempotência, evento/outbox, consistência com o arquivo | Backend | B `documents.service.test`; DB `documents.repository.db.test` (lease, backoff, corrida com arquivamento); E2E `documents` | Aprovado |
| 06.1.1 / 06.1.2 / 06.1.3 Autenticação e perfis | Login, sessão, expiração, papéis, retorno seguro; cadastro público não cria admin | Backend + Frontend | B `auth.routes.test`, `auth.register-role.test`, `session.service.test`, `requireAuth.test`, `requireRole.test`; F `Auth.test`; E2E `flows` "Autorização e isolamento…", `assistants` | Aprovado |
| Transversal: autorização | Todo endpoint documentado como protegido responde 401 sem sessão; públicos são login, registro, raiz e health | Backend | B `openapi.contract.test` | Aprovado |
| Transversal: isolamento por projeto | Busca, documentos, decisões, análises e chat nunca cruzam projetos ou usuários | Backend + E2E | DB `backlog-search.db.test`, `decisions.db.test`, `documents.repository.db.test`, `chat.repository.db.test`; E2E `documents`, `flows`, `assistants` | Aprovado |
| Transversal: OpenAPI x entrega | Documentado ⊆ implementado e implementado ⊆ documentado (aliases `/api/*` equivalem a `/api/v1/*`) | Documentação + Backend | B `openapi.contract.test` | Aprovado |
| Transversal: acessibilidade básica | axe (WCAG 2 A/AA) sem violação crítica/séria em 10 telas; foco visível; erros anunciados; mobile sem overflow | Frontend | E2E `a11y`, `documents`, `assistants` | Aprovado |

## Cobertura por camada de estados de erro

| Estado | Onde é provado |
|---|---|
| 400 validação | rotas de cada módulo + E2E `flows`, `documents` |
| 401 sem sessão | `openapi.contract.test` (todas as rotas protegidas) + E2E |
| 403 perfil sem permissão | `requireRole.test` + E2E `documents`, `flows` (dev) |
| 404 recurso/projeto inexistente ou de outro usuário | rotas + E2E `assistants` (conversa alheia) |
| 409 projeto/item arquivado | DB (corridas) + E2E `documents`, `flows`, `hierarchy-ui` |
| 413 arquivo acima do limite | `documents.validation.test` + E2E `documents` |
| 503 dependência indisponível (armazenamento, motor de IA) | `documents.service.test`, `repo-analyses.routes.test` + E2E `assistants` |

## Lacunas conhecidas (não escondidas)

1. Várias suítes de frontend anteriores (`Epics.test`, `Features` em `Epics.test`, `QualityPanel.test`, `ItemArchive.test`, `Projects.test`, `ProjectArchive.test`) exercitam **componentes legados** em `frontend/src/backlog/*` e `frontend/src/projects/Projects.tsx`, que a aplicação não importa mais (as telas ativas estão em `frontend/src/views/*`). As telas ativas de épico/feature/PBI/qualidade/arquivamento são provadas pelos cenários `hierarchy-ui`, `flows` e `a11y`. Recomendação: migrar ou remover os componentes e testes legados em tarefa própria.
2. Não há cenário E2E de administrador (o cadastro público não cria admin e o ambiente de teste não provisiona um); o perfil é coberto por testes de rota (`requireRole.test`, `auth.register-role.test`).
3. Ingestão e indexação de documentos são S2-01; a matriz cobre apenas o armazenamento, listagem e remoção.
4. O serviço de IA não é exercitado; os cenários provam o comportamento com ele indisponível.
