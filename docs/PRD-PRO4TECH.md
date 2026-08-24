# Documento de Requisitos do Produto
## Base Inteligente de Requisitos e Conhecimento

**Cliente:** PRO4TECH — Digital Tech Transformation
**Executor:** Grupo Galáticos — Fatec São José dos Campos, Prof. Jessen Vidal (Centro Paula Souza)
**Projeto Integrador — 4º Semestre · 2º Semestre de 2026**
**Versão 1.0 — 24/08/2026 · Documento para validação**

---

## Sumário

Este documento consolida o entendimento do desafio apresentado no kick-off e propõe o
escopo, a arquitetura e o plano de entrega da solução. Ele é submetido à PRO4TECH para
**validação antes do início da Sprint 1**, em 07/09/2026.

A seção 12 reúne os pontos que dependem de alinhamento com o cliente.

---

## 1. Contexto

A PRO4TECH atua como fábrica de software nas frentes de aplicações web e nativas,
Inteligência Artificial, Business Intelligence, automação de processos, IoT e consultoria de
redesenho de processos de negócio. A operação é conduzida em Scrum, com execução por squads
e esteira de DevOps integrada, controlada e monitorada após as liberações.

A atuação se organiza em quatro pilares — product design da sprint, UX com validação de
protótipos junto ao cliente, execução por squads com DevOps, e manutenção e sustentação — e
em três modelos de contratação: fábrica de programas, sustentação de sistemas e fábrica de
projetos.

A empresa conta atualmente com quatro Product Owners.

## 2. O problema

Durante o levantamento de requisitos, a operação enfrenta hoje:

- **Ausência de padrão** — cada Product Owner documenta funcionalidades de forma distinta.
- **Dispersão da informação** — conteúdo relevante espalhado entre documentos, conversas e
  projetos.
- **Baixo reúso** — soluções já construídas nem sempre são lembradas no momento da nova
  especificação.
- **Dependência do conhecimento individual** — o aprendizado de uma pessoa não se transfere
  às demais e se perde na rotatividade da equipe.
- **Rastreabilidade custosa** — recuperar o que foi definido, e por quê, exige esforço.
- **Onboarding lento** — novos integrantes levam tempo excessivo para se contextualizar em
  sistemas legados.

> O desafio não é documentar requisitos, mas transformar o que se aprende em conhecimento
> reutilizável.

## 3. Visão do produto

Uma plataforma na qual o Product Owner estrutura projetos e features e utiliza Inteligência
Artificial como apoio durante o levantamento de requisitos — constituindo, como resultado
natural do trabalho cotidiano, a memória técnica da fábrica de software.

**Pilar 1 — Levantamento inteligente.** Estruturação em `Projeto → Épico → Feature →
Requisito`, com a IA apoiando o PO a detalhar necessidades, identificar informações
faltantes, padronizar a documentação, consultar requisitos semelhantes e produzir uma
especificação estruturada.

**Pilar 2 — Base de conhecimento.** Todo conteúdo produzido alimenta um acervo reutilizável e
pesquisável por significado, e não apenas por palavra-chave. *"Já realizamos alguma integração
com pagamento via PIX?"*

**Pilar 3 — Chat sobre projetos.** Consulta em linguagem natural a todo o conhecimento
armazenado, servindo também como ferramenta de onboarding. *"Como funciona o login do
Projeto A?"*

**Pilar 4 — Conhecimento sobre a equipe.** Competências técnicas, experiência em projetos e
histórico de atuação de cada profissional, apoiando a formação de squads para novas demandas.

### 3.1. Os três eixos de conhecimento

Toda a base é organizada em três eixos que se cruzam:

```
        PROJETOS  ←→  PESSOAS  ←→  TECNOLOGIAS / STACKS
           ↑                              ↑
           └────────── requisitos ────────┘
```

É o cruzamento desses eixos que habilita as consultas de maior valor: *quem* já resolveu
*o quê*, com *qual tecnologia*.

### 3.2. Princípio norteador

> **A Inteligência Artificial não escreve requisitos sozinha. Ela apoia o Product Owner a
> pensar melhor sobre eles.**

Essa diretriz, estabelecida pela PRO4TECH no kick-off, orienta todo o desenho da solução:

- Toda saída da IA é **sugestão**, nunca conteúdo persistido automaticamente.
- Toda sugestão exige **ação humana explícita**: aceitar, editar ou descartar.
- O sistema registra a **origem de cada campo** — escrito pelo PO, sugerido pela IA e aceito,
  ou sugerido e editado.
- O modo primário de atuação da IA é **questionar**, não redigir.

Como detalhado na seção 10.2, esse princípio é garantido pela própria arquitetura, e não
apenas pela interface: o serviço de IA não possui permissão de escrita na base de negócio.

### 3.3. Fronteira de escopo

A gestão da execução dos projetos permanece no **Azure DevOps**.

| A solução NÃO é | A solução É |
|---|---|
| Gestão da execução do projeto | Gestão do **conhecimento** sobre o projeto |
| Sprints, kanban, horas, tarefas, burndown | Requisitos, decisões, competências, histórico |
| Onde a equipe acompanha o trabalho | Onde a equipe **consulta o que já foi aprendido** |

## 4. Objetivos e métricas de sucesso

| # | Objetivo | Métrica | Meta |
|---|---|---|---|
| O1 | Padronizar a documentação de requisitos | Requisitos com todos os campos obrigatórios preenchidos | ≥ 90% |
| O2 | Reduzir o esforço de especificação | Tempo médio para especificar uma feature completa | Redução demonstrável |
| O3 | Promover o reúso de conhecimento | Requisitos criados a partir de uma sugestão do acervo | ≥ 30% |
| O4 | Tornar o acervo consultável | Bateria de 20 perguntas respondidas com fonte citada corretamente | ≥ 80% |
| O5 | Mapear o conhecimento da equipe | Consultas do tipo "quem já trabalhou com X?" respondidas corretamente | ≥ 80% |
| O6 | Acelerar o onboarding | Novo integrante responde questões sobre projeto desconhecido usando apenas o chat | Validado em teste |

## 5. Perfis de usuário

| Perfil | Necessidade principal | O que a plataforma entrega |
|---|---|---|
| **Product Owner** | Especificar sem recomeçar do zero a cada projeto | Copiloto que questiona, padroniza e recupera o histórico |
| **Desenvolvedor / Tech Lead** | Receber requisitos claros e rastreáveis | Especificação estruturada, com critérios de aceite e justificativas |
| **Gestor de Delivery** | Compor squads com base em competência real | Mapa de competências e histórico de atuação |
| **Novo integrante** | Contextualizar-se rapidamente no legado | Chat que responde sobre qualquer projeto anterior |

## 6. Escopo

### 6.1. Contemplado

- Cadastro estruturado em `Projeto → Épico → Feature → Requisito`, seguindo os modelos
  documentais da PRO4TECH
- Template padronizado de requisito, com critérios de aceite e registro de decisões
- Ingestão de conhecimento por upload de documentos, com isolamento por projeto
- Copiloto de IA no levantamento — modos questionador, padronizador e de memória
- Busca combinada semântica e textual sobre todo o acervo
- Chat conversacional sobre a base, com citação obrigatória de fontes
- Base de competências e histórico de atuação dos desenvolvedores
- Recomendação de profissionais com maior afinidade para uma nova demanda
- Autenticação e perfis de acesso

### 6.2. Não contemplado

Conforme definido pela PRO4TECH, a solução não substitui o Azure DevOps: não contempla
sprints, kanban, controle de horas, gestão de tarefas ou burndown.

Também estão fora desta entrega, permanecendo como possibilidades de evolução:

- Geração de código a partir do requisito
- Integração bidirecional com Azure DevOps, Jira ou repositórios Git
- Aplicativo mobile nativo
- Isolamento multi-tenant entre clientes finais

### 6.3. Escopo condicional

Funcionalidades de alto valor identificadas na análise técnica, cuja inclusão depende de
validação com a PRO4TECH (ver seção 12):

| Funcionalidade | Valor esperado |
|---|---|
| Sugestão de stack tecnológica para novo projeto, com base em projetos de escopo similar | Padronização de decisões técnicas |
| Sugestão de composição de squad para um novo projeto | Apoio à alocação |
| Estimativa de esforço com base em entregas anteriores semelhantes | Apoio ao planejamento |
| Ingestão de transcrições de reuniões com o cliente como contexto do projeto | Captura do conhecimento na origem |

## 7. Modelo de domínio

```
Projeto ──1:N──> Épico ──1:N──> Feature ──1:N──> Requisito ──1:N──> CritérioDeAceite
   │                               │                 │
   │                               │                 └──N:N──> Tecnologia
   │                               └──N:N──> Tecnologia
   ├──1:N──> Documento
   └──N:N──> Desenvolvedor (via Alocação: papel, período)

Decisão ──> anexável a Projeto | Épico | Feature | Requisito

Desenvolvedor ──N:N──> Competência (tecnologia + nível + evidência)
```

A hierarquia será ajustada para refletir integralmente a estrutura documental de *epic*,
*feature* e *backlog* praticada pela PRO4TECH, assim que os modelos forem disponibilizados.

### 7.1. Template padronizado de requisito

O padrão de documentação é o artefato central da solução — é ele que endereça diretamente a
ausência de padrão entre os Product Owners. A estrutura proposta:

| Campo | Obrigatório | Descrição |
|---|:---:|---|
| Código | automático | Identificador único e estável |
| Título | ✅ | Frase curta e acionável |
| Tipo | ✅ | Funcional · Não-funcional · Regra de negócio · Integração |
| Descrição | ✅ | O que o sistema deve fazer |
| Ator | ✅ | Quem executa ou é impactado |
| Critérios de aceite | ✅ | Formato Gherkin (`Dado / Quando / Então`) |
| Regras de negócio | — | Restrições e cálculos aplicáveis |
| Prioridade | ✅ | MoSCoW |
| Tecnologias e integrações | — | PIX, WhatsApp, Azure, OAuth… |
| Dependências | — | Requisitos relacionados ou bloqueantes |
| Decisões e justificativas | — | Contexto, decisão e alternativas descartadas |
| Status | ✅ | Rascunho · Em revisão · Aprovado · Obsoleto |
| Origem do conteúdo | automático | Humano · IA aceita · IA editada |
| Versão | automático | Toda alteração é versionada |

**Indicador de completude.** Cada requisito recebe uma pontuação de 0 a 100, calculada a
partir dos campos preenchidos e de heurísticas aplicadas pela IA — ambiguidade, ausência de
caso de falha, critério não verificável. O indicador é exibido durante a edição, oferecendo
retorno contínuo ao Product Owner.

Este template está sujeito a ajuste conforme os modelos documentais da PRO4TECH.

## 8. Requisitos funcionais

Prioridade: **M** (Must) · **S** (Should) · **C** (Could)

### Gestão de Projetos, Épicos e Features

| ID | Requisito | Pri |
|---|---|:---:|
| RF-01 | Criar, editar, listar e arquivar Projetos | M |
| RF-02 | Criar, editar, listar e arquivar Épicos e Features | M |
| RF-03 | Navegar a árvore `Projeto → Épico → Feature → Requisito` com filtros | M |
| RF-04 | Classificar por tecnologias e integrações via vocabulário controlado | S |

### Requisitos estruturados

| ID | Requisito | Pri |
|---|---|:---:|
| RF-05 | Criar requisito conforme o template padronizado | M |
| RF-06 | Cadastrar critérios de aceite em formato Gherkin | M |
| RF-07 | Calcular e exibir o indicador de completude em tempo real | S |
| RF-08 | Versionar alterações, com histórico consultável | S |
| RF-09 | Registrar decisões e justificativas em qualquer nível da hierarquia | M |
| RF-10 | Relacionar requisitos entre si (depende de · similar a · substitui) | S |
| RF-11 | Exportar a especificação de uma feature em Markdown ou PDF | C |

### Copiloto de IA no levantamento

| ID | Requisito | Pri |
|---|---|:---:|
| RF-12 | **Modo questionador** — gerar perguntas sobre lacunas, ambiguidades e casos não cobertos | M |
| RF-13 | **Modo padronizador** — propor o texto reescrito no template padrão, como sugestão editável | M |
| RF-14 | **Modo memória** — sugerir requisitos semelhantes do acervo durante a escrita | M |
| RF-15 | Sugerir critérios de aceite em Gherkin a partir da descrição | S |
| RF-16 | Exigir ação explícita sobre toda sugestão: aceitar, editar ou descartar | M |
| RF-17 | Registrar a origem de cada campo | S |
| RF-18 | Permitir a especificação inteiramente manual, sem uso da IA | M |
| RF-19 | Regência do comportamento da IA por camada configurável, alinhada à cultura de engenharia e às práticas de DevOps da PRO4TECH | S |

### Ingestão de conhecimento

| ID | Requisito | Pri |
|---|---|:---:|
| RF-20 | Upload de documentos (PDF, DOCX, MD, TXT) vinculados a um Projeto | M |
| RF-21 | Processar o documento: extrair, fragmentar, vetorizar e indexar | M |
| RF-22 | Isolar o conteúdo por projeto, com filtro obrigatório na recuperação | M |
| RF-23 | Remover integralmente do índice o conteúdo de um projeto | M |
| RF-24 | Listar os documentos de um projeto com status de processamento | S |
| RF-25 | Ingerir transcrições de reuniões como contexto do projeto | C |
| RF-26 | Registrar repositório e board do projeto como metadados | C |

### Base de conhecimento e busca

| ID | Requisito | Pri |
|---|---|:---:|
| RF-27 | Indexar automaticamente todo conteúdo criado ou alterado | M |
| RF-28 | Busca combinada: semântica e textual, com fusão de resultados | M |
| RF-29 | Filtrar por projeto, tipo, tecnologia, status e período | M |
| RF-30 | Exibir resultados com trecho de contexto e vínculo à origem | M |
| RF-31 | Reindexação incremental na edição e remoção no arquivamento | S |

### Chat sobre o acervo

| ID | Requisito | Pri |
|---|---|:---:|
| RF-32 | Consulta em linguagem natural a todo o conhecimento armazenado | M |
| RF-33 | Citar as fontes em toda resposta, com vínculo navegável | M |
| RF-34 | Declarar ausência de informação quando não houver evidência na base | M |
| RF-35 | Selecionar o escopo da consulta: toda a base, um projeto ou uma feature | M |
| RF-36 | Persistir o histórico de conversas por usuário | S |
| RF-37 | Exibir a resposta em streaming | C |

### Conhecimento sobre a equipe

| ID | Requisito | Pri |
|---|---|:---:|
| RF-38 | Cadastrar desenvolvedores com perfil profissional | M |
| RF-39 | Registrar competências técnicas por tecnologia, com nível e evidência | M |
| RF-40 | Registrar alocação em projetos e features, com papel e período | M |
| RF-41 | Consolidar o histórico de atuação a partir das alocações e dos requisitos | S |
| RF-42 | Responder consultas do tipo "quem já trabalhou com integração PIX?" | M |
| RF-43 | Recomendar profissionais com maior afinidade para uma nova demanda | S |

### Inteligência sobre o acervo *(condicional)*

| ID | Requisito | Pri |
|---|---|:---:|
| RF-44 | Sugerir stack tecnológica para novo projeto com base em escopo similar | C |
| RF-45 | Sugerir composição de squad para um novo projeto | C |
| RF-46 | Estimar esforço com base em entregas anteriores semelhantes | C |

### Acesso e administração

| ID | Requisito | Pri |
|---|---|:---:|
| RF-47 | Autenticação de usuários | M |
| RF-48 | Perfis de acesso: Administrador, Product Owner e Desenvolvedor | S |
| RF-49 | Gestão do vocabulário controlado de tecnologias | S |

## 9. Requisitos não-funcionais

| ID | Requisito |
|---|---|
| RNF-01 | **IA estritamente assistiva** — nenhuma persistência sem confirmação humana |
| RNF-02 | **Respostas fundamentadas** — o chat afirma apenas o que consta na base recuperada, sempre com citação de fonte |
| RNF-03 | **Execução 100% local e offline** — nenhum dado trafega para serviços externos ou nuvem de terceiros |
| RNF-04 | **Integralmente open source** — solução construída sobre ferramentas de código aberto |
| RNF-05 | **Português do Brasil** — interface e pipeline de IA otimizados para o idioma |
| RNF-06 | **Desempenho** — busca em menos de 2 segundos; primeira resposta do chat em menos de 5 segundos |
| RNF-07 | **Usabilidade** — especificação de uma feature completa sem treinamento prévio |
| RNF-08 | **Rastreabilidade** — autoria, data e histórico de versões em todo dado |
| RNF-09 | **LGPD** — dados de competências restritos ao âmbito profissional, com consentimento e acesso controlado |
| RNF-10 | **Portabilidade** — implantação em qualquer máquina via containers |
| RNF-11 | **Qualidade** — versionamento em Git com integração contínua e testes automatizados |
| RNF-12 | **Documentação** — API documentada em OpenAPI e manual de instalação |

## 10. Arquitetura

### 10.1. Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React |
| Backend de aplicação | Node.js |
| Orquestração de IA | Python |
| Banco de dados relacional | PostgreSQL |
| Banco de dados vetorial | pgvector (extensão do PostgreSQL) |
| Pipeline de ingestão | n8n |
| Modelo de linguagem | Modelo aberto executado localmente |
| Versionamento e CI | GitHub |

Toda a stack é open source e opera sem dependência de serviços em nuvem, em atendimento aos
requisitos RNF-03 e RNF-04. Soluções de banco vetorial hospedadas em nuvem foram
descartadas por essa razão.

### 10.2. Visão geral

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  Frontend   │────>│  Backend Node.js │────>│  PostgreSQL          │
│   (React)   │     │  API · Auth ·    │     │  + pgvector          │
└─────────────┘     │  CRUD            │     └──────────────────────┘
                    └────────┬─────────┘                 ▲
                             │ HTTP interno              │
                    ┌────────▼─────────┐        ┌────────┴─────────┐
                    │ Serviço de IA    │        │  Pipeline n8n    │
                    │    (Python)      │        │  ingestão de     │
                    │  Recuperação e   │        │  documentos      │
                    │  geração         │        └──────────────────┘
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Modelos locais  │
                    │  LLM + embedding │
                    └──────────────────┘
```

**Separação de responsabilidades.** O backend Node.js concentra a aplicação — autenticação,
CRUD, permissões, validação e versionamento — e é o único componente com permissão de escrita
nas tabelas de negócio. O serviço Python concentra a IA: vetorização, recuperação, montagem
de contexto e geração.

Essa fronteira é o que garante, em nível de arquitetura, o princípio da seção 3.2: **o serviço
de IA não escreve na base**. Ele devolve sugestões, e a persistência ocorre apenas após
confirmação do usuário.

### 10.3. Recuperação aumentada por geração (RAG)

**Ingestão.** O upload de um documento ou a criação de uma entidade dispara a indexação:
extração de texto, fragmentação, enriquecimento com metadados (projeto, feature, tipo,
tecnologias, status, data), vetorização e gravação no índice.

**Consulta.** A pergunta do usuário é vetorizada e submetida a uma busca combinada — semântica
e textual — restrita por filtro de metadados. Os trechos mais relevantes compõem o contexto
enviado ao modelo, que responde exclusivamente com base nele e cita as fontes. Na ausência de
contexto pertinente, o sistema declara não possuir a informação.

Duas decisões de projeto merecem destaque:

**Isolamento por projeto via metadados.** A separação de contexto entre projetos é assegurada
por filtro explícito sobre o identificador do projeto, e não por proximidade vetorial —
requisitos semelhantes de projetos distintos são, por natureza, vetorialmente próximos. Esse
é justamente o comportamento desejado para a sugestão de similares, e o motivo pelo qual o
isolamento exige filtro estruturado. O uso do pgvector permite aplicar filtro e busca vetorial
em uma única consulta.

**Busca combinada, e não apenas semântica.** Termos como PIX, WhatsApp e OAuth exigem
correspondência exata, na qual a busca puramente semântica é imprecisa. A fusão dos dois
métodos de busca é o que garante precisão nesse tipo de consulta — recorrente no caso de uso
descrito pela PRO4TECH.

### 10.4. Camada de comportamento da IA

Além do modelo e do mecanismo de recuperação, a solução prevê uma camada dedicada a
governar **como** a IA atua — o formato das respostas, os limites de atuação e as ferramentas
que pode acionar. É nessa camada que se materializam:

- A instrução de **questionar antes de redigir**
- O formato de saída fixo, aderente ao template de requisito
- O vocabulário e as práticas de engenharia da PRO4TECH — Scrum, DevOps, estrutura de épicos
- A regra de citação obrigatória de fonte e recusa de resposta sem evidência
- As operações disponíveis ao modelo: consultar o acervo, buscar competências, listar projetos
  por tecnologia

Essa camada é modular, com uma configuração por modo de operação — levantamento, consulta e
recomendação de equipe — permitindo ajustar o comportamento da IA sem alterar o núcleo da
solução. Trata-se do principal diferencial técnico do projeto: é o que adapta um modelo de
linguagem genérico à cultura de engenharia específica da PRO4TECH.

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

### 11.2. Sprint 1 — Fundação e cadastro estruturado

**Entrega:** cadastro completo de `Projeto → Épico → Feature → Requisito` no padrão
estabelecido, com a base de conhecimento populada e a ingestão de documentos operante.

Autenticação e perfis · CRUD de Projeto, Épico e Feature · Requisito com template padronizado
e critérios de aceite · Registro de decisões · Upload e processamento de documentos ·
Infraestrutura de indexação ponta a ponta · Carga inicial da base de conhecimento

### 11.3. Sprint 2 — Inteligência e reúso

**Entrega:** o Product Owner especifica com apoio da IA e localiza o que já foi construído.

Indexação automática de todo conteúdo · Busca combinada com filtros · Camada de comportamento
da IA · Copiloto nos modos questionador e padronizador · Sugestão de requisitos similares ·
Sugestão de critérios de aceite · Controle de aceite e registro de origem · Indicador de
completude

### 11.4. Sprint 3 — Consulta, pessoas e fechamento

**Entrega:** solução completa, apresentada na Feira de Soluções.

Chat com citação de fontes e escopo selecionável · Histórico de conversas · Base de
competências e alocações · Consultas sobre a equipe · Recomendação de profissionais ·
Versionamento de requisitos · Refinamento de experiência e documentação

### 11.5. Critérios de conclusão

Cada entrega é considerada concluída mediante: revisão por par e integração via Pull Request;
testes automatizados aprovados na integração contínua; funcionalidade demonstrável em ambiente
executável; endpoints documentados; ausência de regressão nas entregas anteriores; e
documentação atualizada.

## 12. Pontos para alinhamento

Questões cuja definição impacta o desenho da solução:

| # | Questão | Impacto |
|---|---|---|
| Q1 | O Product Owner utilizará a plataforma como **ferramenta principal de especificação** — especificando ali e posteriormente transferindo ao Azure DevOps — ou como **repositório de conhecimento** alimentado após a definição? | Define o peso relativo entre a interface de cadastro e a interface conversacional |
| Q2 | A estimativa de esforço com base no histórico (RF-46) está dentro do escopo desejado, considerando a fronteira estabelecida com o Azure DevOps? | Define a inclusão do escopo condicional |
| Q3 | Há interesse na ingestão de transcrições de reuniões com o cliente como contexto do projeto? | Alto valor para a captura de conhecimento; amplia o escopo |
| Q4 | Qual a estrutura documental oficial de épico, feature e backlog praticada pela PRO4TECH? | Define o modelo de dados e o template de requisito |
| Q5 | Existe interesse em integração com o Azure DevOps, ainda que somente de leitura? | Habilitaria uma fonte de dados relevante, hoje fora do escopo |
| Q6 | Qual o volume esperado de usuários simultâneos e de projetos na base? | Dimensiona a infraestrutura de execução local dos modelos |

## 13. Materiais necessários

Conforme acordado no kick-off, os seguintes materiais são necessários ao andamento do
projeto:

| # | Material | Finalidade | Ideal até |
|---|---|---|---|
| 1 | Modelos de estruturação de projeto — epic, feature e backlog | Assegurar que a modelagem do sistema siga o padrão documental da PRO4TECH, e não um formato genérico | 28/08 |
| 2 | Exemplos de projetos e requisitos já realizados | Compor a base de conhecimento inicial. Como a proposta de valor da plataforma é o reúso do conhecimento acumulado, a ausência de uma base inicial impede a demonstração do comportamento real da solução. Um conjunto de 5 a 10 projetos é suficiente | 04/09 |
| 3 | Apresentação institucional da empresa | Contextualização da equipe e documentação do projeto | — |

Os materiais podem ser fornecidos de forma **anonimizada** — com nomes de clientes e dados
sensíveis substituídos. O que é relevante ao projeto é a estrutura da documentação e a
natureza dos requisitos, não a identificação dos envolvidos.

Cabe registrar que a arquitetura definida executa integralmente de forma local e offline, com
modelos de IA open source: nenhum dado trafega para serviços de terceiros ou para a nuvem
(RNF-03).

---

**Grupo Galáticos** — Fatec São José dos Campos · Prof. Jessen Vidal
Projeto Integrador — 4º Semestre · 2º Semestre de 2026
