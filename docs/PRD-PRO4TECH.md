# Documento de Requisitos do Produto
## Base Inteligente de Requisitos e Conhecimento

**Cliente:** PRO4TECH — Digital Tech Transformation
**Executor:** Grupo Galáticos — Fatec São José dos Campos, Prof. Jessen Vidal (Centro Paula Souza)
**Projeto Integrador — 4º Semestre · 2º Semestre de 2026**
**Versão 1.1 — 02/09/2026 · Documento para validação**

---

## Sumário

Este documento consolida o entendimento do desafio apresentado no kick-off e propõe o escopo,
a arquitetura e o plano de entrega da solução. É submetido à PRO4TECH para **validação antes
do início da Sprint 1**, em 07/09/2026.

**Revisão 1.1** — incorpora o *Guia de Especificação de Itens de Trabalho* disponibilizado pela
PRO4TECH em 25/08. A hierarquia, a estrutura de cada nível e os critérios de qualidade da
solução passam a seguir integralmente o padrão da empresa. As mudanças estão concentradas nas
seções 7 e 8.

A seção 12 reúne os pontos que dependem de alinhamento com o cliente.

---

## 1. Contexto

A PRO4TECH atua como fábrica de software nas frentes de aplicações web e nativas, Inteligência
Artificial, Business Intelligence, automação de processos, IoT e consultoria de redesenho de
processos de negócio. A operação é conduzida em Scrum, com execução por squads e esteira de
DevOps integrada, controlada e monitorada após as liberações.

A atuação se organiza em quatro pilares — product design da sprint, UX com validação de
protótipos junto ao cliente, execução por squads com DevOps, e manutenção e sustentação — e em
três modelos de contratação: fábrica de programas, sustentação de sistemas e fábrica de
projetos.

A empresa conta atualmente com quatro Product Owners.

## 2. O problema

Durante o levantamento de requisitos, a operação enfrenta hoje:

- **Ausência de padrão** — cada Product Owner documenta funcionalidades de forma distinta.
- **Dispersão da informação** — conteúdo relevante espalhado entre documentos, conversas e
  projetos.
- **Baixo reúso** — soluções já construídas nem sempre são lembradas na nova especificação.
- **Dependência do conhecimento individual** — o aprendizado de uma pessoa não se transfere às
  demais e se perde na rotatividade da equipe.
- **Rastreabilidade custosa** — recuperar o que foi definido, e por quê, exige esforço.
- **Onboarding lento** — novos integrantes levam tempo excessivo para se contextualizar em
  sistemas legados.

> O desafio não é documentar requisitos, mas transformar o que se aprende em conhecimento
> reutilizável.

## 3. Visão do produto

Uma plataforma na qual o Product Owner estrutura o backlog de produto e utiliza Inteligência
Artificial como apoio durante o levantamento de requisitos — constituindo, como resultado
natural do trabalho cotidiano, a memória técnica da fábrica de software.

**Pilar 1 — Levantamento inteligente.** Estruturação em `Projeto → Épico → Feature → PBI`,
seguindo o padrão documental da PRO4TECH, com a IA apoiando o PO a detalhar necessidades,
identificar informações faltantes, padronizar a documentação, consultar itens semelhantes e
produzir uma especificação estruturada.

**Pilar 2 — Base de conhecimento.** Todo conteúdo produzido alimenta um acervo reutilizável e
pesquisável por significado, e não apenas por palavra-chave. *"Já realizamos alguma integração
com pagamento via PIX?"*

**Pilar 3 — Chat sobre projetos.** Consulta em linguagem natural a todo o conhecimento
armazenado, servindo também como ferramenta de onboarding.

**Pilar 4 — Conhecimento sobre a equipe.** Competências técnicas, experiência em projetos e
histórico de atuação de cada profissional, apoiando a formação de squads.

### 3.1. Os três eixos de conhecimento

```
        PROJETOS  ←→  PESSOAS  ←→  TECNOLOGIAS / STACKS
           ↑                              ↑
           └──── itens de backlog ────────┘
```

### 3.2. Princípio norteador

> **A Inteligência Artificial não escreve requisitos sozinha. Ela apoia o Product Owner a
> pensar melhor sobre eles.**

- Toda saída da IA é **sugestão**, nunca conteúdo persistido automaticamente.
- Toda sugestão exige **ação humana explícita**: aceitar, editar ou descartar.
- O sistema registra a **origem de cada campo**.
- O modo primário de atuação da IA é **questionar**, não redigir.

Como detalhado na seção 10.2, o princípio é garantido pela própria arquitetura: o serviço de
IA não possui permissão de escrita na base de negócio.

### 3.3. Fronteira de escopo

A gestão da execução dos projetos permanece no **Azure DevOps**.

| A solução NÃO é | A solução É |
|---|---|
| Gestão da execução do projeto | Gestão do **conhecimento** sobre o projeto |
| Sprints, kanban, horas, tarefas, burndown | Backlog especificado, decisões, competências, histórico |
| Onde a equipe acompanha o trabalho | Onde a equipe **consulta o que já foi aprendido** |

## 4. Objetivos e métricas de sucesso

| # | Objetivo | Métrica | Meta |
|---|---|---|---|
| O1 | Padronizar a documentação | Itens aprovados no checklist de qualidade da PRO4TECH | ≥ 90% |
| O2 | Reduzir o esforço de especificação | Tempo médio para especificar uma Feature completa | Redução demonstrável |
| O3 | Promover o reúso de conhecimento | PBIs criados a partir de uma sugestão do acervo | ≥ 30% |
| O4 | Tornar o acervo consultável | Bateria de 20 perguntas com fonte citada corretamente | ≥ 80% |
| O5 | Mapear o conhecimento da equipe | Consultas "quem já trabalhou com X?" respondidas corretamente | ≥ 80% |
| O6 | Acelerar o onboarding | Novo integrante responde sobre projeto desconhecido usando apenas o chat | Validado em teste |

## 5. Perfis de usuário

| Perfil | Necessidade principal | O que a plataforma entrega |
|---|---|---|
| **Product Owner** | Especificar sem recomeçar do zero a cada projeto | Copiloto que questiona, padroniza e recupera o histórico |
| **Desenvolvedor / Tech Lead** | Receber itens claros e testáveis | Especificação estruturada, com cenários verificáveis |
| **Gestor de Delivery** | Compor squads com base em competência real | Mapa de competências e histórico de atuação |
| **Novo integrante** | Contextualizar-se rapidamente no legado | Chat que responde sobre qualquer projeto anterior |

## 6. Escopo

### 6.1. Contemplado

- Cadastro estruturado em `Projeto → Épico → Feature → PBI`, conforme o *Guia de Especificação
  de Itens de Trabalho* da PRO4TECH
- Validação automática da especificação contra o checklist de qualidade do guia
- Ingestão de conhecimento por upload de documentos, com isolamento por projeto
- Copiloto de IA no levantamento — modos questionador, padronizador e de memória
- Busca combinada semântica e textual sobre todo o acervo
- Chat conversacional com citação obrigatória de fontes
- Base de competências e histórico de atuação dos desenvolvedores
- Recomendação de profissionais com maior afinidade para uma nova demanda
- Autenticação e perfis de acesso

### 6.2. Não contemplado

Conforme definido pela PRO4TECH, a solução não substitui o Azure DevOps: não contempla
sprints, kanban, controle de horas, gestão de tarefas ou burndown.

O guia admite tarefas técnicas abaixo do PBI. Essas tarefas permanecem fora do escopo desta
solução, por pertencerem à execução: **o PBI é o nível mais granular tratado pela
plataforma**.

Também fora desta entrega, como possibilidades de evolução: geração de código a partir da
especificação; integração bidirecional com Azure DevOps, Jira ou repositórios Git; aplicativo
mobile nativo; isolamento multi-tenant entre clientes finais.

### 6.3. Escopo condicional

Funcionalidades de alto valor cuja inclusão depende de validação com a PRO4TECH (seção 12):

| Funcionalidade | Valor esperado |
|---|---|
| Sugestão de stack tecnológica para novo projeto, com base em escopo similar | Padronização de decisões técnicas |
| Sugestão de composição de squad | Apoio à alocação |
| Estimativa de esforço com base em entregas anteriores | Apoio ao planejamento |
| Ingestão de transcrições de reuniões com o cliente | Captura do conhecimento na origem |

## 7. Estrutura dos itens de trabalho

A modelagem da plataforma segue integralmente o *Guia de Especificação de Itens de Trabalho*
da PRO4TECH. Cada nível responde a uma pergunta distinta e possui estrutura obrigatória
própria — o que o guia identifica como a principal defesa contra a inconsistência de backlog.

```
Projeto ──1:N──> Épico ──1:N──> Feature ──1:N──> PBI
   │                │              │              ├──1:N──> Critérios (cenários)
   │                │              │              └──0:N──> Protótipo
   │                │              └──1:N──> Critérios (regras gerais)
   │                └──1:N──> Critérios (condições macro)
   ├──1:N──> Documento
   └──N:N──> Desenvolvedor (via Alocação)
```

> **Sobre o nível "Projeto".** O guia inicia a hierarquia no Épico. Mantivemos um nível de
> Projeto acima dele, conforme indicado no kick-off, por ser também a chave do isolamento de
> contexto entre bases. Ponto submetido a validação — ver Q4.

### 7.1. Épico

*Que resultado amplo queremos alcançar?* — foco em resultado, abrangência e limites.

| Campo | Obrigatório |
|---|:---:|
| Título — nome curto da iniciativa, compreensível fora do contexto de uma reunião | ✅ |
| Descrição — o que será construído ou alterado, para quem e em qual contexto | ✅ |
| Objetivo — propósito e valor esperado | ✅ |
| Escopo macro — grandes grupos de capacidades, sem descer a telas ou regras específicas | ✅ |
| Resultado esperado — estado desejado após a conclusão | ✅ |
| Critérios de aceitação — condições amplas e verificáveis | ✅ |

A plataforma orienta o autor a manter os critérios do Épico em nível macro, sinalizando quando
o texto desce ao detalhe de tela — comportamento que o guia atribui ao PBI.

### 7.2. Feature

*Que capacidade o produto precisa oferecer?* — foco em comportamento funcional e regras gerais.

| Campo | Obrigatório |
|---|:---:|
| Título — nome da capacidade funcional, evitando títulos genéricos | ✅ |
| Descrição — a capacidade, seu contexto e os comportamentos contemplados | ✅ |
| Objetivo — benefício funcional ou operacional esperado | ✅ |
| Critérios de aceitação — regras gerais, fluxos essenciais e restrições | ✅ |

A plataforma aplica o teste de granularidade do guia: se a capacidade ainda precisa ser
dividida em diferentes ações, estados ou fluxos, ela permanece uma Feature e deve originar
PBIs.

### 7.3. Product Backlog Item

*Que comportamento específico será implementado?* — unidade implementável, demonstrável e
testável.

| Campo | Obrigatório |
|---|:---:|
| Título — verbo no infinitivo + objeto da ação | ✅ |
| História do usuário — `COMO UM` / `EU QUERO` / `PARA QUE` | ✅ |
| Protótipo ou referência visual — anexável, sem substituir os critérios escritos | — |
| Critérios de aceitação — cenários independentes em `DADO` / `QUANDO` / `ENTÃO` | ✅ |
| Regras e observações — dependências, restrições e decisões fora dos cenários | — |

**Cobertura mínima dos cenários.** A plataforma verifica as seis dimensões previstas no guia e
questiona o autor sobre as ausentes: caminho principal · validações · erros e indisponibilidade
· permissões e segurança · estados alternativos · interface e compatibilidade.

Esta lista é o núcleo do modo questionador da IA: em vez de gerar perguntas genéricas, o
sistema confronta a especificação com o padrão da PRO4TECH e pergunta exatamente sobre o que
falta.

### 7.4. Checklist de qualidade

As doze verificações do guia são aplicadas pela plataforma antes de um item ser considerado
pronto. Boa parte é verificada **de forma determinística, sem depender do modelo de IA** — o
que torna o indicador de completude consistente e auditável:

| Verificação | Forma de validação |
|---|---|
| Título do PBI começa com verbo no infinitivo | Automática |
| História possui os três blocos obrigatórios | Automática |
| Critérios do PBI escritos em cenários | Automática |
| Épico possui os cinco campos obrigatórios e critérios | Automática |
| Termos vagos removidos | Automática, por lista de termos |
| Critérios do Épico em nível macro | Assistida por IA |
| Feature vinculada a um resultado do Épico | Assistida por IA |
| Feature decomponível em PBIs independentes | Assistida por IA |
| Cobertura de caminho principal, validações e erros | Assistida por IA |
| Protótipo anexado quando necessário, sem substituir regras | Automática |
| Ausência de informação conflitante entre níveis | Assistida por IA |
| Dependências e restrições explícitas | Assistida por IA |

A plataforma também sinaliza os antipadrões descritos no guia: Épico excessivamente técnico,
Feature que é apenas um PBI grande, PBI com título genérico, critério subjetivo, protótipo como
única especificação, critério que descreve implementação e duplicação entre níveis.

### 7.5. Extensões ao padrão

Campos adicionais ao guia, **opcionais e que nunca bloqueiam o cadastro**. O padrão da PRO4TECH
permanece como núcleo obrigatório.

| Campo | Justificativa |
|---|---|
| Decisões e justificativas | O kick-off identificou a dificuldade de recuperar "o que foi definido e por quê". O guia não contempla esse registro, e ele é essencial à proposta de memória |
| Tecnologias e integrações | Chave do reúso: é o que permite responder "já fizemos integração com PIX?" |
| Tipo e prioridade | Apoio à organização e à busca no acervo |
| Relações entre itens | Depende de · similar a · substitui |

## 8. Requisitos funcionais

Prioridade: **M** (Must) · **S** (Should) · **C** (Could)

### Estrutura do backlog de produto

| ID | Requisito | Pri |
|---|---|:---:|
| RF-01 | Criar, editar, listar e arquivar Projetos | M |
| RF-02 | Criar, editar, listar e arquivar Épicos com a estrutura de 7.1 | M |
| RF-03 | Criar, editar, listar e arquivar Features com a estrutura de 7.2 | M |
| RF-04 | Criar, editar, listar e arquivar PBIs com a estrutura de 7.3 | M |
| RF-05 | Navegar a árvore `Projeto → Épico → Feature → PBI` com filtros | M |
| RF-06 | Classificar itens por tecnologias e integrações | S |

### Qualidade da especificação

| ID | Requisito | Pri |
|---|---|:---:|
| RF-07 | Registrar critérios de aceitação nos três níveis, no formato adequado a cada um | M |
| RF-08 | Validar que o título do PBI começa com verbo no infinitivo | M |
| RF-09 | Validar a presença dos três blocos da história do usuário | M |
| RF-10 | Validar que os critérios do PBI estão em cenários | M |
| RF-11 | Detectar termos vagos e sinalizá-los ao autor | S |
| RF-12 | Executar o checklist de qualidade por nível, exibindo o que falta | M |
| RF-13 | Calcular e exibir o indicador de completude em tempo real | S |
| RF-14 | Sinalizar duplicação e conflito de informação entre níveis | C |

### Extensões ao padrão

| ID | Requisito | Pri |
|---|---|:---:|
| RF-15 | Registrar decisões e justificativas em qualquer nível | M |
| RF-16 | Versionar alterações, com histórico consultável | S |
| RF-17 | Relacionar itens entre si | S |
| RF-18 | Classificar PBI por tipo e prioridade, sem bloquear o cadastro | C |
| RF-19 | Exportar a especificação de um Épico ou Feature | C |

### Copiloto de IA no levantamento

| ID | Requisito | Pri |
|---|---|:---:|
| RF-20 | **Modo questionador** — apontar lacunas contra a cobertura mínima e o checklist | M |
| RF-21 | **Modo padronizador** — propor o texto reescrito na estrutura do nível, como sugestão editável | M |
| RF-22 | **Modo memória** — sugerir itens semelhantes do acervo durante a escrita | M |
| RF-23 | Sugerir cenários a partir da história do usuário | S |
| RF-24 | Exigir ação explícita sobre toda sugestão | M |
| RF-25 | Registrar a origem de cada campo | S |
| RF-26 | Permitir especificação inteiramente manual | M |
| RF-27 | Reger o comportamento da IA por camada configurável (seção 10.4) | S |

### Ingestão de conhecimento

| ID | Requisito | Pri |
|---|---|:---:|
| RF-28 | Upload de documentos vinculados a um Projeto | M |
| RF-29 | Processar o documento: extrair, fragmentar, vetorizar e indexar | M |
| RF-30 | Anexar protótipo ou referência visual a um PBI | S |
| RF-31 | Isolar o conteúdo por projeto, com filtro obrigatório na recuperação | M |
| RF-32 | Remover integralmente do índice o conteúdo de um projeto | M |
| RF-33 | Listar documentos de um projeto com status de processamento | S |
| RF-34 | Ingerir transcrições de reuniões como contexto do projeto | C |
| RF-35 | Registrar repositório e board do projeto como metadados | C |

### Base de conhecimento e busca

| ID | Requisito | Pri |
|---|---|:---:|
| RF-36 | Indexar automaticamente todo conteúdo criado ou alterado | M |
| RF-37 | Busca combinada: semântica e textual | M |
| RF-38 | Filtrar por projeto, nível, tecnologia, status e período | M |
| RF-39 | Exibir resultados com trecho de contexto e vínculo à origem | M |
| RF-40 | Reindexação incremental na edição e remoção no arquivamento | S |

### Chat sobre o acervo

| ID | Requisito | Pri |
|---|---|:---:|
| RF-41 | Consulta em linguagem natural a todo o conhecimento armazenado | M |
| RF-42 | Citar as fontes em toda resposta, com vínculo navegável | M |
| RF-43 | Declarar ausência de informação quando não houver evidência na base | M |
| RF-44 | Selecionar o escopo da consulta | M |
| RF-45 | Persistir o histórico de conversas por usuário | S |
| RF-46 | Exibir a resposta em streaming | C |

### Conhecimento sobre a equipe

| ID | Requisito | Pri |
|---|---|:---:|
| RF-47 | Cadastrar desenvolvedores com perfil profissional | M |
| RF-48 | Registrar competências técnicas por tecnologia, com nível e evidência | M |
| RF-49 | Registrar alocação em projetos, épicos e features | M |
| RF-50 | Consolidar o histórico de atuação | S |
| RF-51 | Responder consultas do tipo "quem já trabalhou com integração PIX?" | M |
| RF-52 | Recomendar profissionais com maior afinidade para uma nova demanda | S |

### Inteligência sobre o acervo *(condicional)*

| ID | Requisito | Pri |
|---|---|:---:|
| RF-53 | Sugerir stack tecnológica para novo projeto | C |
| RF-54 | Sugerir composição de squad | C |
| RF-55 | Estimar esforço com base em entregas anteriores | C |

### Acesso e administração

| ID | Requisito | Pri |
|---|---|:---:|
| RF-56 | Autenticação de usuários | M |
| RF-57 | Perfis de acesso: Administrador, Product Owner e Desenvolvedor | S |
| RF-58 | Gestão do vocabulário controlado de tecnologias | S |

## 9. Requisitos não-funcionais

| ID | Requisito |
|---|---|
| RNF-01 | **IA estritamente assistiva** — nenhuma persistência sem confirmação humana |
| RNF-02 | **Respostas fundamentadas** — o chat afirma apenas o que consta na base recuperada, sempre com citação |
| RNF-03 | **Execução 100% local e offline** — nenhum dado trafega para serviços externos ou nuvem de terceiros |
| RNF-04 | **Ferramentas de código aberto** — solução construída sobre software livre |
| RNF-05 | **Português do Brasil** — interface e pipeline de IA otimizados para o idioma |
| RNF-06 | **Desempenho** — busca em menos de 2 segundos; primeira resposta do chat em menos de 5 segundos |
| RNF-07 | **Usabilidade** — especificação de uma Feature completa sem treinamento prévio |
| RNF-08 | **Rastreabilidade** — autoria, data e histórico de versões em todo dado |
| RNF-09 | **Conformidade com o padrão do cliente** — a estrutura de Épico, Feature e PBI segue o *Guia de Especificação de Itens de Trabalho* |
| RNF-10 | **LGPD** — dados de competências restritos ao âmbito profissional, com consentimento |
| RNF-11 | **Portabilidade** — implantação em qualquer máquina via containers |
| RNF-12 | **Qualidade** — versionamento em Git com integração contínua e testes automatizados |
| RNF-13 | **Documentação** — API documentada em OpenAPI e manual de instalação |

## 10. Arquitetura

### 10.1. Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React |
| Backend de aplicação | Node.js |
| Orquestração de IA | Python |
| Banco de dados relacional | PostgreSQL |
| Banco de dados vetorial | pgvector (extensão do PostgreSQL) |
| Modelo de linguagem | Modelo aberto executado localmente |
| Versionamento e CI | GitHub |

A stack opera sem dependência de serviços em nuvem, em atendimento aos requisitos RNF-03 e
RNF-04. Soluções de banco vetorial hospedadas em nuvem foram descartadas por essa razão.

### 10.2. Visão geral

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  Frontend   │────>│  Backend Node.js │────>│  PostgreSQL          │
│   (React)   │     │  API · Auth ·    │     │  + pgvector          │
└─────────────┘     │  CRUD · validação│     └──────────────────────┘
                    └────────┬─────────┘                 ▲
                             │ HTTP interno              │
                    ┌────────▼─────────┐        ┌────────┴─────────┐
                    │ Serviço de IA    │        │  Ingestão de     │
                    │    (Python)      │        │  documentos      │
                    └────────┬─────────┘        └──────────────────┘
                             │
                    ┌────────▼─────────┐
                    │  Modelos locais  │
                    └──────────────────┘
```

**Separação de responsabilidades.** O backend Node.js concentra a aplicação — autenticação,
CRUD, permissões, versionamento e as validações determinísticas do checklist — e é o único
componente com permissão de escrita nas tabelas de negócio. O serviço Python concentra a IA:
vetorização, recuperação, montagem de contexto, geração, e as verificações do checklist que
exigem julgamento.

Essa fronteira é o que garante, em nível de arquitetura, o princípio da seção 3.2: **o serviço
de IA não escreve na base**. Ele devolve sugestões, e a persistência ocorre apenas após
confirmação do usuário.

### 10.3. Recuperação aumentada por geração

**Ingestão.** O upload de um documento ou a criação de um item dispara a indexação: extração de
texto, fragmentação, enriquecimento com metadados (projeto, nível, tecnologias, status, data),
vetorização e gravação no índice.

**Consulta.** A pergunta é vetorizada e submetida a uma busca combinada — semântica e textual —
restrita por filtro de metadados. Os trechos mais relevantes compõem o contexto enviado ao
modelo, que responde exclusivamente com base nele e cita as fontes. Na ausência de contexto
pertinente, o sistema declara não possuir a informação.

Duas decisões de projeto merecem destaque:

**Isolamento por projeto via metadados.** A separação de contexto é assegurada por filtro
explícito sobre o identificador do projeto, e não por proximidade vetorial — itens semelhantes
de projetos distintos são, por natureza, vetorialmente próximos. Esse é justamente o
comportamento desejado para a sugestão de similares, e o motivo pelo qual o isolamento exige
filtro estruturado.

**Busca combinada, e não apenas semântica.** Termos como PIX, WhatsApp e OAuth exigem
correspondência exata, na qual a busca puramente semântica é imprecisa. A fusão dos dois
métodos garante precisão nesse tipo de consulta — recorrente no caso de uso descrito pela
PRO4TECH.

**Unidade de fragmentação.** Cada Épico, Feature e PBI é indexado como uma unidade única, sem
fragmentação por tamanho fixo. O guia da PRO4TECH já define a granularidade semântica correta,
e preservá-la evita que uma regra de negócio seja partida ao meio na recuperação.

### 10.4. Camada de comportamento da IA

Além do modelo e do mecanismo de recuperação, a solução prevê uma camada dedicada a governar
**como** a IA atua — o formato das respostas, os limites de atuação e as operações que pode
acionar. É nessa camada que se materializam:

- A instrução de **questionar antes de redigir**
- O formato de saída aderente à estrutura de cada nível
- **O Guia de Especificação de Itens de Trabalho como regra do sistema** — a cobertura mínima
  de cenários, os antipadrões e o checklist de qualidade são configuração da plataforma, e não
  interpretação do modelo
- O vocabulário e as práticas de engenharia da PRO4TECH — Scrum, DevOps
- A regra de citação obrigatória de fonte e recusa de resposta sem evidência
- As operações disponíveis: consultar o acervo, buscar competências, listar projetos por
  tecnologia

A camada é modular, com uma configuração por modo de operação — levantamento, consulta e
recomendação de equipe — permitindo ajustar o comportamento sem alterar o núcleo da solução.
É o que adapta um modelo de linguagem genérico ao padrão de especificação e à cultura de
engenharia específicas da PRO4TECH.

## 11. Plano de entrega

### 11.1. Calendário

| Etapa | Período |
|---|---|
| Construção do Backlog de Produto | 31/08 a 04/09 |
| **Sprint 1** | **07/09 a 27/09** |
| Sprint Review / Planning | 28/09 a 02/10 |
| **Sprint 2** | **05/10 a 25/10** |
| Sprint Review / Planning | 26/10 a 30/10 |
| **Sprint 3** | **02/11 a 22/11** |
| Sprint Review | 23/11 a 27/11 |
| **Feira de Soluções** | **03/12** |

### 11.2. Sprint 1 — Fundação e estrutura de backlog

**Entrega:** cadastro completo de `Projeto → Épico → Feature → PBI` no padrão da PRO4TECH, com
as validações estruturais operantes, ingestão de documentos funcionando e a base de
conhecimento populada.

Autenticação e perfis · CRUD dos quatro níveis com estrutura obrigatória · Critérios de
aceitação nos três níveis · Validações automáticas de título, história e cenários · Registro de
decisões · Upload e processamento de documentos · Carga inicial da base

### 11.3. Sprint 2 — Inteligência e reúso

**Entrega:** o Product Owner especifica com apoio da IA e localiza o que já foi construído.

Indexação automática e busca combinada · Camada de comportamento da IA com o guia embutido ·
Copiloto nos modos questionador e padronizador · Sugestão de itens similares e de cenários ·
Controle de aceite e registro de origem · Checklist completo e indicador de completude ·
Detecção de termos vagos

### 11.4. Sprint 3 — Consulta, pessoas e fechamento

**Entrega:** solução completa, apresentada na Feira de Soluções.

Chat com citação de fontes e escopo selecionável · Histórico de conversas · Base de
competências e alocações · Consultas sobre a equipe · Recomendação de profissionais ·
Versionamento de itens · Protótipos anexados a PBI · Refinamento de experiência e documentação

### 11.5. Critérios de conclusão

Cada entrega é considerada concluída mediante: revisão por par e integração via Pull Request;
testes automatizados aprovados na integração contínua; funcionalidade demonstrável em ambiente
executável; endpoints documentados; ausência de regressão nas entregas anteriores; e
documentação atualizada.

## 12. Pontos para alinhamento

| # | Questão | Impacto |
|---|---|---|
| Q1 | O Product Owner utilizará a plataforma como **ferramenta principal de especificação** — especificando ali e posteriormente transferindo ao Azure DevOps — ou como **repositório de conhecimento** alimentado após a definição? | Define o peso relativo entre a interface de cadastro e a interface conversacional |
| Q2 | A estimativa de esforço com base no histórico está no escopo desejado? O guia trata estimativa em cada nível, o que sugere aderência | Define a inclusão do escopo condicional |
| Q3 | Há interesse na ingestão de transcrições de reuniões com o cliente como contexto do projeto? | Alto valor para a captura de conhecimento; amplia o escopo |
| Q4 | **Existe um nível "Projeto" acima do Épico?** O guia inicia a hierarquia no Épico, enquanto o kick-off mencionava a criação de projetos | Define a raiz da hierarquia e o critério de isolamento entre bases |
| Q5 | Os itens de trabalho recebem código ou identificador em algum padrão de nomenclatura da empresa? | Define o formato do identificador na plataforma |
| Q6 | Existe interesse em integração com o Azure DevOps, ainda que somente de leitura? | Habilitaria uma fonte de dados relevante, hoje fora do escopo |
| Q7 | Qual o volume esperado de usuários simultâneos e de projetos na base? | Dimensiona a infraestrutura de execução local dos modelos |

## 13. Materiais

### 13.1. Recebidos

| Material | Aplicação |
|---|---|
| Apresentação institucional | Contextualização da equipe e documentação do projeto |
| **Guia de Especificação de Itens de Trabalho** | Aplicado integralmente nas seções 7 e 8 desta revisão. Define a hierarquia, a estrutura obrigatória de cada nível e os critérios de qualidade da plataforma |

### 13.2. Pendente

| Material | Finalidade |
|---|---|
| **Exemplos de projetos e requisitos já realizados** | Compor a base de conhecimento inicial. A proposta de valor da plataforma é o reúso do conhecimento acumulado; sem uma base inicial, não é possível demonstrar o comportamento real da solução. Um conjunto de 5 a 10 projetos é suficiente |

O guia recebido é declaradamente genérico, com exemplos fictícios — ele estabelece o padrão de
escrita, mas não fornece conteúdo para a base.

Os materiais podem ser fornecidos de forma **anonimizada**, com nomes de clientes e dados
sensíveis substituídos: o que é relevante ao projeto é a estrutura da documentação e a natureza
dos itens, não a identificação dos envolvidos. Cabe registrar que a arquitetura definida
executa integralmente de forma local e offline, com modelos de IA open source — nenhum dado
trafega para serviços de terceiros ou para a nuvem (RNF-03).

---

**Grupo Galáticos** — Fatec São José dos Campos · Prof. Jessen Vidal
Projeto Integrador — 4º Semestre · 2º Semestre de 2026
