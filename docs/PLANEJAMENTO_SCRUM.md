# Planejamento de Tarefas por Sprint — Sinapse

> Organização das tarefas de desenvolvimento e sua relação direta com as User Stories do Backlog de Produto v1.0.

## Visão geral

| Informação | Quantidade |
|---|:---:|
| Épicos | 6 |
| Features | 18 |
| User Stories/PBIs | 63 |
| Tarefas técnicas | 67 |
| Sprints | 3 |

Este planejamento converte as 63 User Stories em tarefas técnicas executáveis. Cada tarefa está vinculada a pelo menos um PBI existente e deve ser validada contra os respectivos cenários de aceitação.

A distribuição individual está em andamento. As atribuições já confirmadas aparecem abaixo; todas as demais tarefas continuam sem responsável definido.

## Distribuição parcial da equipe

### Habilitadores da Sprint 1

| Tarefa | Entrega | Responsável(is) |
|---|---|---|
| PRE-05 | Design System e protótipo navegável | Giovanni |
| PRE-07 | Spike de embeddings em português | Rafael Matesco |
| PRE-08 | Correção das vulnerabilidades do backend | Vitor e Gustavo Bueno |

### Implementação da Sprint 1

| Tarefa | Entrega | Responsável |
|---|---|---|
| S1-01 | Autenticação, sessões, papéis e proteção contra tentativas indevidas | Gustavo Bueno |
| S1-02 | Telas de login/logout e proteção das rotas do frontend | Giovanni |
| S1-03 | API de cadastro, listagem e consulta de projetos | Daniel (PO) |
| S1-04 | Interface de cadastro e consulta de projetos | Giovanni |
| S1-10 | Modelo e regras dos critérios de aceitação | Vitor |
| S1-13 | Validações automáticas de qualidade dos PBIs | Vitor |

> **Observação sobre a S1-03:** Daniel foi informado como responsável e identificado como Product Owner. A atribuição foi registrada exatamente dessa forma; durante o acompanhamento, convém deixar claro quando ele atua na implementação e quando atua na validação de produto.

### Resumo por pessoa

| Pessoa | Tarefas atribuídas | Quantidade |
|---|---|:---:|
| Giovanni | PRE-05, S1-02, S1-04 | 3 |
| Vitor | PRE-08, S1-10, S1-13 | 3 |
| Gustavo Bueno | PRE-08, S1-01 | 2 |
| Rafael Matesco | PRE-07 | 1 |
| Daniel (PO) | S1-03 | 1 |

`PRE-08` é uma tarefa compartilhada por duas pessoas. Por isso, o total de atribuições individuais é dez, distribuído entre nove tarefas.

## Como ler este documento

O documento foi organizado para atender dois públicos:

- **Visão de produto:** a seção “O que será entregue” explica o resultado de cada sprint sem depender de conhecimento técnico.
- **Visão de desenvolvimento:** as tabelas apresentam o identificador, a entrega técnica e os PBIs que definem o comportamento esperado.

### Glossário rápido

| Termo | Explicação simples |
|---|---|
| Épico | Objetivo amplo do produto que reúne várias capacidades |
| Feature | Capacidade do produto que ajuda a realizar um épico |
| User Story | Necessidade escrita do ponto de vista de quem usará o produto |
| PBI | Identificador da User Story no backlog, como `PBI-01.1.1` |
| Tarefa técnica | Trabalho concreto necessário para implementar uma ou mais User Stories |
| Habilitador | Preparação técnica necessária antes de uma funcionalidade |
| RAG | Técnica que permite à IA responder usando informações recuperadas do acervo |
| Spike | Investigação curta usada para reduzir uma dúvida técnica |

## Documentos de referência

| Documento | Conteúdo |
|---|---|
| [Índice do backlog](backlog/README.md) | Organização dos seis épicos e das 18 features |
| [EP-01 — Especificar o backlog](backlog/EP-01-especificar-backlog.md) | Estruturação, qualidade e navegação do backlog |
| [EP-02 — Preservar o conhecimento](backlog/EP-02-preservar-conhecimento.md) | Documentos, indexação e busca |
| [EP-03 — Apoio de inteligência artificial](backlog/EP-03-apoio-inteligencia-artificial.md) | Sugestões e assistência por IA |
| [EP-04 — Consultar o conhecimento](backlog/EP-04-consultar-conhecimento.md) | Consulta fundamentada e conversas |
| [EP-05 — Competências da equipe](backlog/EP-05-competencias-equipe.md) | Perfis, competências e alocações |
| [EP-06 — Acesso controlado](backlog/EP-06-acesso-controlado.md) | Autenticação e administração |
| [Plano detalhado](planning/PLANO_DE_TAREFAS_DESENVOLVIMENTO.md) | Escopo, prioridade, dependências e tamanho das tarefas |

## Sprint 1

**Período:** 07/09/2026 a 27/09/2026

**Quantidade:** 32 tarefas

**Meta:** entregar a hierarquia no padrão PRO4TECH, autenticação, validações determinísticas, decisões e anexos sem dependência de IA.

### O que será entregue

Ao final da Sprint 1, espera-se que uma pessoa autorizada consiga entrar na plataforma, criar e organizar projetos, épicos, features e PBIs, registrar critérios de aceitação e decisões, navegar pela estrutura e anexar documentos. O sistema também deverá orientar a escrita conforme o padrão da PRO4TECH.

### Habilitadores

| ID | Entrega em linguagem direta | User Stories relacionadas |
|---|---|---|
| PRE-01 | Confirmar com a PRO4TECH as regras que afetam estrutura, identificação e uso do produto | PBI-01.1.1, PBI-01.1.2, PBI-01.1.3, PBI-01.1.4 |
| PRE-02 | Criar migrations e completar o banco de dados para que o ambiente possa ser reproduzido com segurança | PBI-01.1.1, PBI-01.1.5, PBI-01.5.1, PBI-02.2.4, PBI-03.2.2, PBI-04.2.1, PBI-05.1.1, PBI-06.1.1 |
| PRE-03 | Definir o contrato de comunicação entre backend, serviço de IA e automações | PBI-02.1.1, PBI-02.1.4, PBI-02.2.1, PBI-03.2.1 |
| PRE-04 | Preparar testes automatizados para backend, frontend e serviço de IA | PBI-01.3.1, PBI-02.3.1, PBI-04.1.3, PBI-06.1.1 |
| PRE-05 | Definir componentes visuais e validar um protótipo navegável do fluxo principal | PBI-01.1.1, PBI-01.1.2, PBI-01.1.3, PBI-01.1.4 |
| PRE-06 | Preparar dados fictícios ou anonimizados para desenvolvimento e validação | PBI-02.3.1, PBI-03.1.4, PBI-05.2.1 |
| PRE-07 | Comparar modelos de embeddings em português e escolher a configuração inicial | PBI-02.3.1, PBI-04.1.1 |
| PRE-08 | Avaliar e tratar com segurança as vulnerabilidades conhecidas do backend | PBI-06.1.1, PBI-06.1.2, PBI-06.1.3 |
| PRE-09 | Comprovar que todo o ambiente funciona do zero em uma máquina com Docker | PBI-02.2.1, PBI-03.1.1, PBI-04.1.1 |

### Implementação funcional

| ID | Entrega em linguagem direta | User Stories relacionadas |
|---|---|---|
| S1-01 | Criar autenticação segura, sessões, papéis e bloqueio de tentativas indevidas | PBI-06.1.1, PBI-06.1.2, PBI-06.1.3 |
| S1-02 | Criar as telas de entrada e saída e proteger o acesso às páginas internas | PBI-06.1.1, PBI-06.1.2, PBI-06.1.3 |
| S1-03 | Criar a API para cadastrar, listar e consultar projetos | PBI-01.1.1 |
| S1-04 | Criar a interface de cadastro e consulta de projetos | PBI-01.1.1 |
| S1-05 | Permitir cadastrar e consultar épicos dentro de um projeto | PBI-01.1.2 |
| S1-06 | Permitir cadastrar e consultar features dentro de um épico | PBI-01.1.3 |
| S1-07 | Permitir cadastrar e consultar PBIs dentro de uma feature | PBI-01.1.4 |
| S1-08 | Permitir editar itens com auditoria e proteção contra perda de alterações | PBI-01.1.5 |
| S1-09 | Permitir arquivar itens sem perder o histórico e mostrar o impacto da ação | PBI-01.1.6 |
| S1-10 | Modelar critérios de aceitação adequados para épicos, features e PBIs | PBI-01.2.1, PBI-01.2.2, PBI-01.2.3 |
| S1-11 | Criar os editores de critérios de aceitação para cada nível | PBI-01.2.1, PBI-01.2.2, PBI-01.2.3 |
| S1-12 | Permitir reordenar cenários e manter a ordem escolhida | PBI-01.2.4 |
| S1-13 | Validar automaticamente título, história, cenários e termos vagos | PBI-01.3.1, PBI-01.3.2, PBI-01.3.3, PBI-01.3.4 |
| S1-14 | Mostrar um painel de qualidade e indicar como corrigir problemas | PBI-01.3.5 |
| S1-15 | Calcular e exibir o nível de completude do item | PBI-01.3.6 |
| S1-16 | Criar navegação hierárquica, caminho do item e filtros de consulta | PBI-01.4.1, PBI-01.4.2 |
| S1-17 | Permitir localizar itens por título ou descrição | PBI-01.4.3 |
| S1-18 | Registrar e consultar decisões e justificativas em qualquer nível | PBI-01.5.1, PBI-01.5.2 |
| S1-19 | Permitir upload seguro de documentos suportados | PBI-02.1.1 |
| S1-20 | Exibir documentos, metadados e estado de processamento | PBI-02.1.2 |
| S1-21 | Permitir anexar e visualizar protótipos associados a PBIs | PBI-02.1.3 |
| S1-22 | Remover anexos e eliminar de forma consistente o conteúdo indexado | PBI-02.1.4 |
| S1-23 | Integrar e validar os fluxos obrigatórios da Sprint 1 com testes e documentação | PBI-01.1.1, PBI-01.1.2, PBI-01.1.3, PBI-01.1.4, PBI-01.1.5, PBI-01.2.1, PBI-01.2.2, PBI-01.2.3, PBI-01.3.1, PBI-01.3.2, PBI-01.3.3, PBI-01.3.5, PBI-01.4.1, PBI-01.4.2, PBI-01.5.1, PBI-01.5.2, PBI-02.1.1, PBI-06.1.1, PBI-06.1.2, PBI-06.1.3 |

## Sprint 2

**Período:** 05/10/2026 a 25/10/2026

**Quantidade:** 18 tarefas

**Meta:** formar o acervo pesquisável e introduzir a IA como apoio assistivo, sempre com confirmação humana.

### O que será entregue

Ao final da Sprint 2, documentos e itens concluídos deverão formar um acervo pesquisável. A busca combinará significado e termos exatos, respeitará o projeto selecionado e levará a pessoa até a fonte. A IA poderá apontar lacunas, padronizar textos e sugerir conteúdo semelhante, mas nada será salvo sem confirmação humana.

| ID | Entrega em linguagem direta | User Stories relacionadas |
|---|---|---|
| S2-01 | Processar documentos em segundo plano, mostrar o estado e permitir nova tentativa após falha | PBI-02.2.1 |
| S2-02 | Extrair e dividir textos e armazenar vetores com a origem de cada trecho | PBI-02.2.1 |
| S2-03 | Indexar automaticamente itens concluídos e decisões salvas | PBI-02.2.2 |
| S2-04 | Atualizar o índice sem duplicar dados e retirar conteúdo arquivado | PBI-02.2.3 |
| S2-05 | Remover com segurança todo o contexto de um projeto sem afetar os demais | PBI-02.2.4 |
| S2-06 | Criar busca híbrida em português, combinando significado e texto exato | PBI-02.3.1 |
| S2-07 | Aplicar filtros de projeto, tecnologia e nível sem vazar informações | PBI-02.3.2 |
| S2-08 | Criar a interface de resultados e o acesso à fonte original | PBI-02.3.3 |
| S2-09 | Versionar instruções, modos e formatos de resposta usados pela IA | PBI-03.3.1, PBI-03.3.2 |
| S2-10 | Fazer a IA identificar lacunas e sugerir padronização por nível | PBI-03.1.1, PBI-03.1.2 |
| S2-11 | Sugerir cenários estruturados quando a história estiver completa | PBI-03.1.3 |
| S2-12 | Sugerir itens semelhantes sem interromper o trabalho e sempre informar a origem | PBI-03.1.4 |
| S2-13 | Permitir aceitar, editar ou descartar sugestões antes de salvar | PBI-03.2.1 |
| S2-14 | Registrar a origem de cada campo e manter todo o fluxo utilizável sem IA | PBI-03.2.2, PBI-03.2.3 |
| S2-15 | Relacionar itens e impedir ciclos inválidos entre dependências | PBI-01.5.3 |
| S2-16 | Guardar versões e permitir comparar alterações de um item | PBI-01.5.4 |
| S2-17 | Criar uma base de consultas para medir precisão, isolamento e velocidade da busca | PBI-02.3.1, PBI-02.3.2 |
| S2-18 | Integrar e validar os fluxos obrigatórios da Sprint 2, inclusive falhas e segurança | PBI-02.2.1, PBI-02.2.2, PBI-02.2.4, PBI-02.3.1, PBI-02.3.2, PBI-02.3.3, PBI-03.1.1, PBI-03.1.2, PBI-03.1.4, PBI-03.2.1, PBI-03.2.2, PBI-03.2.3, PBI-03.3.1, PBI-03.3.2 |

## Sprint 3

**Período:** 02/11/2026 a 22/11/2026

**Quantidade:** 17 tarefas

**Meta:** entregar consulta fundamentada, memória de conversas, perfis profissionais, administração e o release final.

### O que será entregue

Ao final da Sprint 3, as pessoas poderão conversar com o acervo e receber respostas apoiadas por fontes verificáveis. O sistema também reunirá perfis, competências e histórico de projetos, apoiará a busca por profissionais e oferecerá funções administrativas. A última etapa consolidará segurança, desempenho, acessibilidade e documentação para a entrega final.

| ID | Entrega em linguagem direta | User Stories relacionadas |
|---|---|---|
| S3-01 | Responder perguntas usando somente evidências recuperadas e mostrar as fontes utilizadas | PBI-04.1.1, PBI-04.1.2 |
| S3-02 | Recusar ou limitar respostas quando não houver evidência suficiente | PBI-04.1.3 |
| S3-03 | Permitir busca geral ou por projeto, sempre respeitando as permissões | PBI-04.1.4 |
| S3-04 | Criar a interface de conversa com escopo visível, citações e acesso às fontes | PBI-04.1.1, PBI-04.1.2, PBI-04.1.3, PBI-04.1.4 |
| S3-05 | Salvar conversas privadas e organizar o histórico de cada pessoa | PBI-04.2.1 |
| S3-06 | Retomar uma conversa preservando mensagens, fontes e escopo | PBI-04.2.2 |
| S3-07 | Exibir a resposta enquanto ela é gerada e permitir cancelar o recebimento | PBI-04.2.3 |
| S3-08 | Cadastrar e consultar perfis profissionais com uso responsável de dados | PBI-05.1.1, PBI-05.1.4 |
| S3-09 | Registrar competências, níveis e evidências usando vocabulário controlado | PBI-05.1.2 |
| S3-10 | Registrar alocações e formar automaticamente o histórico de projetos | PBI-05.1.3, PBI-05.2.3 |
| S3-11 | Informar quem trabalhou com uma tecnologia e apresentar evidências | PBI-05.2.1 |
| S3-12 | Recomendar profissionais de forma explicável, sem realizar alocação automática | PBI-05.2.2 |
| S3-13 | Administrar papéis e permissões sem remover o último administrador | PBI-06.2.1 |
| S3-14 | Administrar o vocabulário de tecnologias e competências | PBI-06.2.2 |
| S3-15 | Exportar a especificação de épicos ou features em Markdown | PBI-01.5.5 |
| S3-16 | Validar desempenho, autorização, privacidade, acessibilidade e operação local | PBI-04.1.1, PBI-04.1.2, PBI-04.1.3, PBI-04.1.4, PBI-05.1.1, PBI-05.1.2, PBI-05.1.3, PBI-05.1.4, PBI-05.2.1 |
| S3-17 | Executar a regressão final e preparar documentação, dados, recuperação e demonstração | PBI-04.1.1, PBI-04.1.2, PBI-05.2.1, PBI-06.2.1, PBI-06.2.2 |

## Regras de rastreabilidade

1. Toda tarefa conserva o ID técnico `PRE-*`, `S1-*`, `S2-*` ou `S3-*`.
2. Toda tarefa referencia ao menos um PBI no formato `PBI-XX.X.X`.
3. Os critérios de aceitação oficiais permanecem nos documentos do backlog.
4. Uma tarefa pode atender a vários PBIs quando a implementação for transversal.
5. Um PBI pode originar várias tarefas quando exigir entregas separadas de interface, backend, dados, IA ou qualidade.
6. Habilitadores, integrações e atividades de release também indicam os PBIs beneficiados.

## Resumo de cobertura

| Sprint | Tarefas | Situação |
|:---:|:---:|---|
| 1 | 32 | Todas relacionadas a PBIs existentes |
| 2 | 18 | Todas relacionadas a PBIs existentes |
| 3 | 17 | Todas relacionadas a PBIs existentes |
| **Total** | **67** | **63 PBIs cobertos, sem tarefas órfãs** |
