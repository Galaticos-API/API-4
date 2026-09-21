# Plano de tarefas de desenvolvimento — Sinapse

**Responsável pelo processo Scrum:** Cauan Gabriel

**Equipe considerada:** 7 pessoas

**Atribuição individual:** parcial; 9 tarefas com responsáveis confirmados

**Base funcional:** Backlog de Produto v1.1 (08/09/2026), 6 épicos, 18 features e 66 PBIs

**Estado do código analisado:** `main` no commit `c776043`

**Distribuição:** exatamente 3 sprints; 71 tarefas técnicas (33 / 21 / 17)

## 1. Objetivo deste plano

Converter o backlog de produto em cartões de execução técnica rastreáveis, pequenos o
suficiente para acompanhamento diário e preparados para posterior organização no Trello.
Este documento não substitui os PBIs nem altera seus critérios de aceitação. Cada tarefa
abaixo deve ser executada e demonstrada contra os cenários do PBI indicado.

A atribuição individual está em andamento. Nove tarefas já possuem responsáveis confirmados;
as demais continuam sem responsável. As etiquetas de componente indicam somente a natureza
do trabalho e não substituem a atribuição nominal.

### Distribuição parcial confirmada

| Fase | Tarefa | Responsável(is) |
|---|---|---|
| Habilitador da Sprint 1 | PRE-05 — Design System e protótipo | Giovanni |
| Habilitador da Sprint 1 | PRE-07 — Spike de embeddings PT-BR | Rafael Matesco |
| Habilitador da Sprint 1 | PRE-08 — Tratar vulnerabilidades do backend | Vitor e Gustavo Bueno |
| Sprint 1 | S1-01 — Domínio de identidade e autenticação | Gustavo Bueno |
| Sprint 1 | S1-02 — Login, logout e proteção de rotas no frontend | Giovanni |
| Sprint 1 | S1-03 — API de projetos | Daniel (PO) |
| Sprint 1 | S1-04 — Interface de projetos | Giovanni |
| Sprint 1 | S1-10 — Critérios de aceitação por nível | Vitor |
| Sprint 1 | S1-13 — Motor de validação determinística | Vitor |

Daniel foi informado como responsável pela `S1-03` e identificado como Product Owner. Esta
definição deve distinguir sua atuação na implementação de sua responsabilidade de validar o
valor e os critérios de produto.

### Cobertura Integral dos PBIs da Revisão v1.1

O parecer da PRO4TECH sobre o backlog v1.0 acrescentou quatro PBIs e fundiu o `PBI-01.4.3` no `PBI-01.4.2` (com `S1-17` reapontada). Todos os quatro novos itens foram mapeados em tarefas técnicas dedicadas, assegurando 100% de cobertura do backlog:

| PBI | Título | Tarefa Técnica | Sprint | Prioridade |
|---|---|:---:|:---:|:---:|
| `PBI-01.5.6` | Justificar a alteração de um item | `S1-24` | 1 | Must |
| `PBI-01.6.1` | Configurar as verificações de qualidade da organização | `S2-19` | 2 | Must |
| `PBI-01.6.2` | Definir a Definição de Preparado e a Definição de Pronto | `S2-20` | 2 | Should |
| `PBI-03.2.4` | Restringir as sugestões ao acervo e ao item em edição | `S2-21` | 2 | Must |

## 2. Premissas e divergências identificadas

- A informação mais recente do Scrum Master prevalece para capacidade: a equipe tem 7
  pessoas. O índice Markdown antigo ainda menciona 9 pessoas.
- O PDF v1.0 de 03/09/2026 foi a referência original de escopo e calendário. O escopo vigente
  é a v1.1 do backlog, de 08/09/2026, com 66 PBIs após o parecer da PRO4TECH.
- A hierarquia de trabalho adotada provisoriamente é
  `Projeto -> Épico -> Feature -> PBI`, conforme PRD e backlog.
- A plataforma é uma base de conhecimento e especificação. Sprint, kanban, horas e gestão de
  tarefas permanecem fora do produto Sinapse; o Trello será usado apenas pelo time para gerir
  esta execução.
- A IA é estritamente assistiva. O serviço Python não grava nas tabelas de negócio e nenhuma
  sugestão pode ser persistida sem aceite explícito no backend Node.js.
- Busca e chat com escopo de projeto devem aplicar filtro obrigatório por `projeto_id`.
- Todo processamento de IA deve ser local e compatível com português do Brasil.

## 3. Diagnóstico do ponto de partida

### Já existe

- Repositório Git, Dockerfiles, Docker Compose e pipeline de CI.
- PostgreSQL 16 com pgvector e um DDL inicial.
- Esqueletos do backend Express/TypeScript, frontend React/Vite e serviço FastAPI.
- Health checks básicos, cliente Ollama, chunker inicial e workflow n8n de gatilho.
- Documentação de produto, arquitetura, backlog e setup.

### Ainda não existe ou precisa ser corrigido antes dos PBIs

- Não há rotas funcionais além de health/info, autenticação, CRUD, busca ou chat.
- A tela React atual é um painel estático de arquitetura, não a interface do produto.
- O serviço de IA calcula vetores, mas não os persiste nem recupera do pgvector; falhas de
  embedding são engolidas e ainda podem resultar em status de sucesso.
- O schema não cobre integralmente o backlog: faltam decisão, versão, proveniência por campo,
  checklist, estado ativo do usuário, auditoria completa e restrições de domínio.
- O DDL é um arquivo de inicialização, sem mecanismo de migrations versionadas.
- Não há testes automatizados, script de teste nos pacotes ou OpenAPI do backend.
- O ambiente local não pôde ser validado com Docker nesta máquina porque o executável não
  está instalado/disponível no PATH. Builds de backend e frontend e compilação Python passam.
- O `npm audit` do backend reporta 3 vulnerabilidades moderadas, que devem ser triadas sem
  atualização automática incompatível.

## 4. Modelo dos futuros cartões do Trello

Usar o título: `[Sprint][Prioridade][Componente] ID - Resultado`.

Campos recomendados:

- **PBI:** código e link para o arquivo de backlog.
- **Resultado:** comportamento observável ao concluir o cartão.
- **Checklist técnico:** implementação, testes, integração e documentação.
- **Dependências:** outros cartões que precisam estar prontos.
- **Tamanho:** `P` (até 1 dia), `M` (1 a 2 dias), `G` (2 a 3 dias).
- **Etiquetas:** Frontend, Backend, Banco, IA/RAG, n8n, QA, UX, Segurança, Docs.
- **Responsável:** usar a distribuição parcial confirmada; manter vazio somente nas tarefas
  ainda não distribuídas.

Cartões maiores que 3 dias devem ser quebrados durante o Planning. A prioridade dos cartões
deriva dos PBIs: nenhum `Should` ou `Could` deve começar enquanto houver `Must` bloqueante na
mesma sprint.

## 5. Definição de pronto global

Uma tarefa só vai para **Concluído** quando:

- o resultado e todos os cenários dos PBIs vinculados são demonstráveis;
- regras de autorização e isolamento por projeto têm testes de negação, quando aplicáveis;
- testes automatizados relevantes passam na CI;
- o código foi revisado por outra pessoa e integrado via Pull Request;
- não há regressão nos fluxos entregues anteriormente;
- endpoint novo ou alterado está documentado em OpenAPI;
- alteração de workflow n8n passou por `n8n-sync validate`;
- logs não expõem senha, token, conteúdo sensível ou documento completo;
- documentação de instalação/uso foi atualizada quando necessário.

## 6. Sprint 1 — habilitadores iniciais

Estas nove tarefas pertencem à **Sprint 1** e devem receber a etiqueta `Sprint 1` no
Trello. O prefixo `PRE` apenas sinaliza que são habilitadores a iniciar antes das tarefas
funcionais dependentes; ele não representa uma quarta sprint nem uma etapa externa ao plano.

| ID | Prioridade | Situação Técnica | Tarefa | Evidência / Resultado verificável | Dependências | Tam. | Etiquetas |
|---|---|---|---|---|---|:---:|---|
| PRE-01 | Bloqueante | Concluída | Registrar decisões Q1-Q5 com a PRO4TECH | Decisões registradas no backlog v1.1 e quadro | — | P | Docs, Produto |
| PRE-02 | Bloqueante | Concluída | Adotar migrations versionadas e corrigir o schema | Migrations 001–004 e runner Node executados e registrados no banco ativo | PRE-01 | G | Banco, Backend |
| PRE-03 | Must | Concluída | Definir contrato HTTP Node-Python-n8n | Contrato OpenAPI versionado em docs/api/openapi.yaml | PRE-01 | M | Backend, IA/RAG, n8n |
| PRE-04 | Must | Concluída | Criar fundação de testes | Suites de backend, frontend e IA executadas pela CI; o runner do backend descobre testes recursivamente (47 testes atuais). Revisão independente concluída | — | M | QA, CI |
| PRE-05 | Must | Concluída | Criar Design System e entregar no Figma o protótipo navegável da Sprint 1 | Arquivo Figma editável com tokens, componentes, estados e fluxo Projeto até PBI; link validado pelo PO | PRE-01 | G | UX, Frontend |
| PRE-06 | Must | Concluída | Preparar seed inicial e política de dados | Seed fictício executado duas vezes sem duplicidade; contagens esperadas validadas | — | G | Banco, QA, Docs |
| PRE-07 | Must | Concluída | Executar spike de embeddings PT-BR | Spike executado; modelo BAAI/bge-m3 (1024 dimensões) validado em docs/Spike Embeddings.md | PRE-06 | M | IA/RAG, QA |
| PRE-08 | Must | Concluída | Triar vulnerabilidades do backend | Auditoria de produção limpa com override de dependências no backend | PRE-04 | P | Backend, Segurança |
| PRE-09 | Must | Concluída | Validar ambiente completo em máquina com Docker | Compose validado; imagens reconstruídas e PostgreSQL, backend, frontend e n8n operacionais | PRE-02, PRE-03 | M | DevOps, QA |

## 7. Sprint 1 — implementação funcional — 07/09 a 27/09

**Meta:** cadastrar e consultar a hierarquia completa no padrão PRO4TECH, com autenticação,
validações determinísticas, decisões e anexos, sem depender de IA.

| ID | Pri. | Resultado / escopo técnico | PBIs cobertos | Dependências | Tam. | Etiquetas |
|---|:---:|---|---|---|:---:|---|
| S1-01 | Must | Implementar domínio de identidade: hash de senha, usuário ativo, papéis, limite de tentativas, sessão revogável e expiração por inatividade | PBI-06.1.1, PBI-06.1.2, PBI-06.1.3 | PRE-02, PRE-04 | G | Backend, Banco, Segurança |
| S1-02 | Must | Criar login/logout no frontend, restauração de sessão, guarda de rotas e retorno seguro ao destino original | PBI-06.1.1, PBI-06.1.2, PBI-06.1.3 | S1-01, PRE-05 | M | Frontend, Segurança |
| S1-03 | Must | Implementar API e regras de cadastro/listagem/detalhe de projeto, inclusive nome ativo único e auditoria | PBI-01.1.1 | S1-01, PRE-02 | M | Backend, Banco |
| S1-04 | Must | Implementar tela de projetos e formulário com estados válido, inválido, carregando, erro e vazio | PBI-01.1.1 | S1-03, PRE-05 | M | Frontend, UX |
| S1-05 | Must | Implementar API e tela de épicos com rascunho, conclusão condicionada, vínculo e campos obrigatórios do guia | PBI-01.1.2 | S1-03 | G | Backend, Frontend |
| S1-06 | Must | Implementar API e tela de features com vínculo obrigatório ao épico, contexto navegável e conclusão condicionada | PBI-01.1.3 | S1-05 | M | Backend, Frontend |
| S1-07 | Must | Implementar API e tela de PBIs com história em três campos, status, código provisório e vínculo obrigatório à feature | PBI-01.1.4 | S1-06 | G | Backend, Frontend |
| S1-08 | Must | Implementar edição com aviso de alterações não salvas, auditoria e modo somente leitura para arquivados | PBI-01.1.5 | S1-05, S1-06, S1-07 | M | Backend, Frontend |
| S1-09 | Should | Implementar arquivamento em cascata, prévia da quantidade afetada e filtro de arquivados | PBI-01.1.6 | S1-08 | M | Backend, Frontend, Banco |
| S1-10 | Must | Modelar e implementar critérios polimórficos: texto ordenado para épico/feature e cenário nomeado DADO/QUANDO/ENTÃO para PBI | PBI-01.2.1, PBI-01.2.2, PBI-01.2.3 | PRE-02, S1-05, S1-06, S1-07 | G | Backend, Banco |
| S1-11 | Must | Criar editores de critérios por nível, confirmação de remoção e consulta aos critérios da feature durante a edição do PBI | PBI-01.2.1, PBI-01.2.2, PBI-01.2.3 | S1-10, PRE-05 | G | Frontend, UX |
| S1-12 | Could | Permitir reordenar cenários com persistência de ordem e interação acessível por teclado | PBI-01.2.4 | S1-10, S1-11 | P | Frontend, Backend |
| S1-13 | Must | Implementar motor determinístico configurável para título no infinitivo, história completa, cenário estruturado e termos vagos | PBI-01.3.1, PBI-01.3.2, PBI-01.3.3, PBI-01.3.4 | S1-07, S1-10 | G | Backend, QA |
| S1-14 | Must | Criar painel de qualidade em tempo real, navegação para campo inválido e bloqueio apenas na conclusão | PBI-01.3.5 | S1-13 | M | Frontend, Backend, UX |
| S1-15 | Should | Calcular e exibir completude derivada do checklist, com regra versionada e sem uso de IA; aplicar verificação de protótipo apenas quando o PBI exigir interface | PBI-01.3.6 | S1-13, S1-14 | M | Backend, Frontend |
| S1-16 | Must | Implementar árvore hierárquica, breadcrumb navegável, filtros combinados persistidos na sessão e estados vazios | PBI-01.4.1, PBI-01.4.2 | S1-03, S1-05, S1-06, S1-07 | G | Frontend, Backend |
| S1-17 | Should | Implementar busca textual relacional por título e descrição, com trecho e caminho hierárquico | PBI-01.4.2 | S1-16 | M | Backend, Frontend, Banco |
| S1-18 | Must | Implementar decisões em qualquer nível com contexto, justificativa, alternativas, autor/data e herança visual dos ascendentes | PBI-01.5.1, PBI-01.5.2 | PRE-02, S1-08 | G | Backend, Frontend, Banco |
| S1-19 | Must | Implementar upload seguro de PDF/DOCX/MD/TXT: tamanho configurável, MIME real, armazenamento, retry e auditoria | PBI-02.1.1 | S1-01, PRE-02, PRE-03 | G | Backend, Segurança |
| S1-20 | Should | Criar aba de documentos com metadados, status de processamento, estados vazio/erro e atualização de status | PBI-02.1.2 | S1-19 | M | Frontend, Backend |
| S1-21 | Should | Implementar anexo de protótipo PNG/JPG/PDF com legenda, preview e alerta quando não há cenários | PBI-02.1.3 | S1-07, S1-10, S1-19 | M | Frontend, Backend |
| S1-22 | Should | Implementar remoção confirmada de anexo e evento idempotente para excluir conteúdo indexado | PBI-02.1.4 | S1-19, PRE-03 | M | Backend, IA/RAG, n8n |
| S1-23 | Must | Fechar integração da Sprint 1: testes E2E dos fluxos Must, OpenAPI, acessibilidade básica e roteiro de review | PBI-01.1.1, PBI-01.1.2, PBI-01.1.3, PBI-01.1.4, PBI-01.1.5, PBI-01.2.1, PBI-01.2.2, PBI-01.2.3, PBI-01.3.1, PBI-01.3.2, PBI-01.3.3, PBI-01.3.5, PBI-01.4.1, PBI-01.4.2, PBI-01.5.1, PBI-01.5.2, PBI-02.1.1, PBI-06.1.1, PBI-06.1.2, PBI-06.1.3 | S1-01 a S1-22 | G | QA, Docs, Frontend, Backend |
| S1-24 | Must | Implementar campo de justificativa obrigatória ao alterar item salvo e registro no histórico de auditoria | PBI-01.5.6 | S1-08 | M | Backend, Frontend, Banco |

### Ordem recomendada da Sprint 1

1. PRE-01 a PRE-05 e S1-01.
2. S1-03, S1-05, S1-06, S1-07 e S1-10, com frontend e backend evoluindo pelo mesmo contrato.
3. S1-13, S1-14, S1-16, S1-18 e S1-19.
4. Demais `Should`/`Could`, seguidos de S1-23.

## 8. Sprint 2 — 05/10 a 25/10

**Meta:** constituir o acervo pesquisável e introduzir a IA como copiloto assistivo, sempre
com confirmação humana.

| ID | Pri. | Resultado / escopo técnico | PBIs cobertos | Dependências | Tam. | Etiquetas |
|---|:---:|---|---|---|:---:|---|
| S2-01 | Must | Implementar pipeline assíncrono de documento com estados pendente/processando/processado/falha, motivo e nova tentativa idempotente | PBI-02.2.1 | S1-19, PRE-03, PRE-09 | G | n8n, Backend, IA/RAG |
| S2-02 | Must | Extrair texto de PDF/DOCX/MD/TXT, fragmentar em fronteiras de parágrafo e persistir chunks e embeddings com metadados de origem | PBI-02.2.1 | PRE-07, S2-01 | G | IA/RAG, Banco |
| S2-03 | Must | Publicar eventos de indexação para item concluído e decisão salva, preservando projeto, nível, status e tecnologias | PBI-02.2.2 | S1-18, S2-02 | M | Backend, IA/RAG |
| S2-04 | Should | Implementar upsert/reindexação sem duplicidade e retirada do índice ao arquivar | PBI-02.2.3 | S1-09, S2-03 | M | IA/RAG, Banco |
| S2-05 | Must | Implementar expurgo transacional por projeto com confirmação pelo nome, auditoria e teste de preservação dos demais projetos | PBI-02.2.4 | S2-02 | M | Backend, IA/RAG, Banco, Segurança |
| S2-06 | Must | Implementar busca híbrida PT-BR (vetorial + full-text) com fusão/ranking, limiar de relevância e meta de menos de 2 s | PBI-02.3.1 | PRE-06, PRE-07, S2-02 | G | IA/RAG, Banco, QA |
| S2-07 | Must | Implementar filtros combinados de projeto, tecnologia e nível, com isolamento testado contra vazamento | PBI-02.3.2 | S2-06, S1-01 | M | Backend, IA/RAG, Segurança |
| S2-08 | Must | Criar interface de busca com trecho, projeto/fonte, ausência de resultados e navegação ao item/documento de origem | PBI-02.3.3 | S2-06, S2-07 | G | Frontend, UX |
| S2-09 | Must | Criar harness versionado por modo, schemas de saída e regras PRO4TECH; mudanças entram em vigor sem reiniciar | PBI-03.3.1, PBI-03.3.2 | PRE-03, PRE-07 | G | IA/RAG, Backend |
| S2-10 | Must | Implementar modo questionador de lacunas e modo padronizador por nível, incluindo indisponibilidade sem perda de edição | PBI-03.1.1, PBI-03.1.2 | S2-09 | G | IA/RAG, Frontend |
| S2-11 | Should | Implementar sugestões de cenários estruturados com pré-condição de história completa | PBI-03.1.3 | S2-09, S1-10 | M | IA/RAG, Frontend |
| S2-12 | Must | Implementar sugestão não intrusiva de itens similares entre projetos, com origem e relação ao aproveitar | PBI-03.1.4 | S2-06, S2-09 | G | IA/RAG, Frontend, Backend |
| S2-13 | Must | Implementar ciclo aceitar/editar/descartar com estado visual distinto e idempotência; somente o Node persiste | PBI-03.2.1 | S2-10, S2-12 | G | Frontend, Backend, Segurança |
| S2-14 | Must | Persistir proveniência por campo e garantir cadastro/conclusão integralmente manual com IA indisponível | PBI-03.2.2, PBI-03.2.3 | PRE-02, S2-13 | M | Backend, Banco, QA |
| S2-15 | Should | Implementar relações bidirecionais depende de/similar a/substitui e detecção de ciclo em dependências | PBI-01.5.3 | S1-07 | M | Backend, Frontend, Banco |
| S2-16 | Should | Implementar snapshot de versões, listagem por autor/data e comparação de campos | PBI-01.5.4 | PRE-02, S1-08 | G | Backend, Frontend, Banco |
| S2-17 | Must | Criar bateria versionada de 20+ consultas PT-BR com expectativa, fonte, escopo e métrica de precisão/latência | PBI-02.3.1, PBI-02.3.2 | PRE-06, S2-06 | M | QA, IA/RAG |
| S2-18 | Must | Fechar integração da Sprint 2: falhas recuperáveis, observabilidade, segurança, E2E, OpenAPI e review | PBI-02.2.1, PBI-02.2.2, PBI-02.2.4, PBI-02.3.1, PBI-02.3.2, PBI-02.3.3, PBI-03.1.1, PBI-03.1.2, PBI-03.1.4, PBI-03.2.1, PBI-03.2.2, PBI-03.2.3, PBI-03.3.1, PBI-03.3.2 | S2-01 a S2-17 | G | QA, Docs, Segurança |
| S2-19 | Must | Implementar endpoints e configuração das verificações de qualidade da organização | PBI-01.6.1 | S1-13 | M | Backend, QA |
| S2-20 | Should | Permitir configuração e exibição de Definição de Preparado (DoR) e Definição de Pronto (DoD) | PBI-01.6.2 | S2-19, S1-14 | M | Backend, Frontend |
| S2-21 | Must | Restringir sugestões semânticas do copiloto estritamente ao acervo do projeto e item em edição | PBI-03.2.4 | S2-07, S2-09 | M | IA/RAG, Backend |

## 9. Sprint 3 — 02/11 a 22/11

**Meta:** oferecer chat fundamentado, memória de conversas, conhecimento sobre pessoas e
administração, concluindo o produto para a apresentação final.

| ID | Pri. | Resultado / escopo técnico | PBIs cobertos | Dependências | Tam. | Etiquetas |
|---|:---:|---|---|---|:---:|---|
| S3-01 | Must | Implementar RAG que recupera, monta contexto e retorna resposta estruturada somente com evidências e fontes realmente usadas | PBI-04.1.1, PBI-04.1.2 | S2-06, S2-09, S2-17 | G | IA/RAG, Backend |
| S3-02 | Must | Implementar recusa sem evidência, resposta parcial explícita e bloqueio de assunto fora do acervo, com regressão automatizada | PBI-04.1.3 | S3-01, S2-17 | M | IA/RAG, QA |
| S3-03 | Must | Implementar escopo toda a base/projeto, autorização por projeto e indicação quando ampliar a busca pode encontrar conteúdo | PBI-04.1.4 | S2-07, S3-01 | G | Backend, IA/RAG, Segurança |
| S3-04 | Must | Criar interface de chat com escopo sempre visível, estados de envio/erro, citações e navegação à fonte | PBI-04.1.1, PBI-04.1.2, PBI-04.1.3, PBI-04.1.4 | S3-01, S3-02, S3-03 | G | Frontend, UX |
| S3-05 | Should | Persistir conversas privadas por usuário, ordenar histórico e gerar título a partir da primeira pergunta | PBI-04.2.1 | PRE-02, S3-01 | M | Backend, Banco |
| S3-06 | Should | Implementar retomada com mensagens, fontes e escopo originais preservados | PBI-04.2.2 | S3-05, S3-04 | M | Backend, Frontend |
| S3-07 | Could | Implementar streaming cancelável, preservando texto parcial e anexando fontes apenas após conclusão | PBI-04.2.3 | S3-04 | G | Backend, Frontend, IA/RAG |
| S3-08 | Must | Implementar cadastro/vínculo único e consulta consolidada de perfil profissional, sem dados pessoais fora do propósito | PBI-05.1.1, PBI-05.1.4 | PRE-02, S1-01 | G | Backend, Frontend, LGPD |
| S3-09 | Must | Implementar competências com nível, evidência e seleção obrigatória do vocabulário controlado | PBI-05.1.2 | S3-08, S3-14 | M | Backend, Frontend, Banco |
| S3-10 | Must | Implementar alocações com papel/período, validação de datas e vínculo a projeto; derivar histórico automaticamente | PBI-05.1.3, PBI-05.2.3 | S3-08, S1-03 | G | Backend, Frontend, Banco |
| S3-11 | Must | Responder “quem trabalhou com X?” com profissionais, projetos e evidências; recusar quando não houver base | PBI-05.2.1 | S3-09, S3-10, S3-01 | G | Backend, IA/RAG, Frontend |
| S3-12 | Should | Recomendar profissionais para feature por aderência explicável, sem alocação automática e com aviso de base insuficiente | PBI-05.2.2 | S3-09, S3-10, S2-09 | G | Backend, IA/RAG, Frontend |
| S3-13 | Should | Criar administração de papéis com efeito no próximo acesso, leitura para desenvolvedor e proteção do último admin | PBI-06.2.1 | S1-01 | M | Backend, Frontend, Segurança |
| S3-14 | Should | Criar administração do vocabulário, unicidade normalizada e remoção consciente das associações existentes | PBI-06.2.2 | PRE-02 | M | Backend, Frontend, Banco |
| S3-15 | Could | Exportar épico ou feature em Markdown, respeitando exatamente o escopo e a hierarquia do guia | PBI-01.5.5 | S1-05, S1-06, S1-07, S1-10 | M | Backend, Frontend |
| S3-16 | Must | Validar RNFs: busca <2 s, primeira resposta <5 s, autorização, LGPD, acessibilidade e operação local/offline | PBI-04.1.1, PBI-04.1.2, PBI-04.1.3, PBI-04.1.4, PBI-05.1.1, PBI-05.1.2, PBI-05.1.3, PBI-05.1.4, PBI-05.2.1 | S3-01 a S3-15 | G | QA, Segurança, DevOps |
| S3-17 | Must | Preparar release final: regressão integral, documentação, seed reproduzível, backup/restore, roteiro e ensaio da demonstração | PBI-04.1.1, PBI-04.1.2, PBI-05.2.1, PBI-06.2.1, PBI-06.2.2 | S3-16 | G | QA, Docs, DevOps |

## 10. Cobertura do backlog

| Sprint | PBIs do produto | Tarefas técnicas | Situação neste plano |
|:---:|:---:|:---:|---|
| 1 | 28 | 33 | Todos referenciados em PRE-01 a PRE-09 e S1-01 a S1-24 |
| 2 | 18 | 21 | Todos referenciados em S2-01 a S2-21 |
| 3 | 17 | 17 | Todos referenciados em S3-01 a S3-17 |
| **Total** | **63** | **71** | **Cobertura completa, sem atribuição individual** |

As tarefas PRE e as tarefas de integração não acrescentam funcionalidades ao produto; são
habilitadores e controles de qualidade necessários para que os PBIs satisfaçam a Definição de
Pronto.

## 11. Dependências críticas e riscos para o Scrum Master

1. **Q1-Q5 sem resposta:** pode causar retrabalho de schema, navegação e códigos.
2. **D3 sem dados históricos:** impede demonstrar reúso real; acionar PRE-06 imediatamente.
3. **Docker indisponível em parte do time:** impede validar a promessa de execução por comando
   único e deve ser resolvido antes do fim da Sprint 1.
4. **Ausência de migrations:** mudar `init.sql` não atualiza volumes existentes; PRE-02 é
   bloqueante.
5. **IA sinaliza sucesso em falha:** o endpoint atual captura erro de embedding e ainda retorna
   `chunked_and_indexed`; corrigir antes de qualquer demo de ingestão.
6. **Escopo amplo:** manter `Should` e `Could` fora de andamento enquanto houver `Must`
   bloqueante na sprint.
7. **Segurança transversal:** autenticação não basta; autorização por papel e por projeto deve
   existir em cada consulta, busca, documento e chat.

## 12. Operação do Scrum Master no Trello

O Trello é a fonte de verdade do estado operacional; este documento preserva escopo,
dependências e rastreabilidade. O burndown da Sprint 1 é acompanhado no Power-Up Corrello,
com a lista `1️⃣ Sprint 1 — Backlog` como origem da sprint e `✅ Concluído` como lista de
conclusão.

### Rito diário

1. Conferir no burndown a variação entre a linha real e a ideal e registrar a causa de
   qualquer desvio relevante.
2. Verificar os cartões em `🏃 Em andamento`, `👀 Revisão de código` e `🧪 Teste e Validação`;
   priorizar a remoção de bloqueios e a finalização antes de iniciar novo trabalho.
3. Confirmar que todo cartão em revisão ou teste possui evidência verificável (PR, commit,
   resultado de teste ou roteiro de validação) e que sua dependência ainda está satisfeita.
4. Manter itens `Should` e `Could` fora de andamento enquanto houver item `Must` bloqueante
   da sprint.

### Critérios de movimentação

- `Sprint N — Backlog`: item selecionado para a sprint, ainda não iniciado.
- `Em andamento`: responsável definido, dependências disponíveis e trabalho iniciado.
- `Revisão de código`: implementação submetida e verificável; não representa entrega pronta.
- `Teste e Validação`: revisão concluída e cenário de aceitação disponível para validação.
- `Concluído`: atende a Definição de Pronto global, tem evidência técnica e não possui
  impedimento conhecido.

Um bloqueio que impeça avanço deve ser registrado em `Decisões/Bloqueios` (ou como etiqueta e
comentário no cartão, enquanto a lista não existir), com responsável pela remoção e próxima
data de revisão. Não mover um cartão para concluído apenas para melhorar o burndown.

## 13. Próxima etapa — painel Scrum no Trello

Quando este plano for levado ao Trello, criar inicialmente as listas:

`Decisões/Bloqueios -> Backlog -> Pronto para Sprint -> Em andamento -> Revisão de código ->
Teste/Validação -> Concluído`.

Os cartões devem ser criados a partir dos IDs PRE/S1/S2/S3, preservando PBI, prioridade,
dependências, tamanho, etiquetas e checklist. Usar somente as etiquetas de iteração
`Sprint 1`, `Sprint 2` e `Sprint 3`; todos os cartões `PRE-*` recebem `Sprint 1`. As novas
atribuições devem considerar disponibilidade, competências, dependências e capacidade da
Sprint 1, preservando as responsabilidades já confirmadas neste documento.
