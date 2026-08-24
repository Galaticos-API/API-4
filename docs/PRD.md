# PRD — Sinapse
### Base Inteligente de Requisitos · API 4º Semestre · 2º Semestre 2026 · Grupo Galáticos

> **Nome provisório.** "Sinapse" é sugestão — alternativas: *Mnemo*, *Acervo*, *Córtex*, *Memória*.

| | |
|---|---|
| **Instituição** | Fatec São José dos Campos — Prof. Jessen Vidal / Centro Paula Souza |
| **Cliente / Parceiro acadêmico** | PRO4TECH — Digital Tech Transformation |
| **Contato do cliente** | Rafael (PRO4TECH) — ver pendência P4 |
| **Período** | 03/08/2026 a 14/12/2026 · Feira de Soluções em **03/12/2026** |
| **Fontes** | [Kick-off.md](./Kick-off.md) · Ata do kickoff (Google Docs, 24/08) · Reunião técnica do grupo (24/08) |
| **Status** | 🟡 Rascunho — pendente de validação com o cliente |
| **Última atualização** | 24/08/2026 |

---

## 1. Contexto

A PRO4TECH é uma fábrica de software que atua com apps web e nativos, IA, BI, automação de
processos (RPA/Python), IoT e consultoria de redesenho de processos de negócio. Trabalha com
Scrum, execução por squads e esteira de DevOps integrada, controlada e monitorada após as
liberações.

**Quatro pilares operacionais:** product design da sprint · UX com validação de protótipos
com o cliente · execução por squads com DevOps · manutenção e sustentação.

**Três modelos de contratação:** fábrica de programas (construção) · sustentação de sistemas ·
fábrica de projetos (construção + manutenção posterior).

A empresa conta hoje com **quatro Product Owners**, cada um documentando funcionalidades de
maneira distinta.

## 2. Problema

Durante o levantamento de requisitos, hoje:

- **Falta de padrão** — cada um dos 4 POs documenta uma funcionalidade de um jeito diferente.
- **Dispersão** — informação importante fica espalhada entre documentos, conversas e projetos.
- **Não-reúso** — soluções já construídas antes nem sempre são lembradas na hora certa.
- **Dependência do conhecimento individual** — o que uma pessoa aprendeu não chega às demais,
  e se perde na rotatividade da equipe.
- **Rastreabilidade cara** — consultar depois "o que foi definido e por quê" dá trabalho.
- **Onboarding lento** — novo integrante leva muito tempo para se contextualizar no legado.

> O problema não é documentar requisitos. É **transformar o que aprendemos em conhecimento
> reutilizável**.

## 3. Visão do produto

Uma plataforma onde o Product Owner estrutura projetos e features e usa Inteligência
Artificial **como apoio** durante o levantamento de requisitos — construindo, como efeito
colateral do trabalho normal, a **memória da fábrica de software**.

Três pilares, conforme o kickoff:

1. **Levantamento inteligente** — `Projeto → Feature → Requisito`, com a IA ajudando o PO a
   detalhar necessidades, identificar informações faltantes, padronizar a documentação,
   consultar requisitos semelhantes e gerar uma especificação estruturada.
2. **Base de conhecimento** — todo conteúdo criado alimenta um acervo reutilizável e
   pesquisável semanticamente. *"Já tivemos alguma integração com pagamento via PIX?"*
3. **Chat sobre projetos** — conversar com todo o conhecimento armazenado, servindo também
   como ferramenta de onboarding. *"Como funciona o login do Projeto A?"*

E um quarto eixo: **conhecimento sobre quem desenvolve** — competências técnicas, experiência
em projetos e histórico de atuação, para apoiar a formação de times em novos desafios.

### 3.1. Os três pilares de contexto

Definição da reunião técnica do grupo — toda a base é organizada em três eixos que se
cruzam:

```
        PROJETOS  ←→  PESSOAS  ←→  TECNOLOGIAS / STACKS
           ↑                              ↑
           └────────── requisitos ────────┘
```

É o cruzamento desses três eixos que habilita as respostas de maior valor: *quem* já fez
*o quê* com *qual tecnologia*, e *quanto tempo* levou.

### 3.2. Princípio de produto inegociável

> **A IA não escreve requisitos sozinha. Ela ajuda o PO a pensar melhor sobre eles.**

Restrição explícita do cliente, que orienta todo o design da experiência:

- Toda saída da IA é **sugestão**, nunca conteúdo salvo automaticamente.
- Toda sugestão exige **ação humana explícita**: aceitar, editar ou descartar.
- O sistema registra a **proveniência** de cada campo (escrito pelo PO · sugerido pela IA e
  aceito · sugerido e editado).
- O modo primário da IA é **perguntar**, não redigir.

### 3.3. Fronteira de escopo — a distinção central

O cliente foi enfático: a gestão da execução dos projetos **continua no Azure DevOps**.

| Isto NÃO é | Isto É |
|---|---|
| Gestão da execução do projeto | Gestão do **conhecimento** sobre o projeto |
| Sprints, kanban, horas, tarefas, burndown | Requisitos, decisões, competências, histórico |
| Onde o time acompanha o trabalho | Onde o time **consulta o que já foi aprendido** |

## 4. Objetivos e métricas de sucesso

| # | Objetivo | Métrica | Meta na entrega final |
|---|---|---|---|
| O1 | Padronizar a documentação de requisitos | % de requisitos com todos os campos obrigatórios preenchidos | ≥ 90% |
| O2 | Reduzir o esforço de especificação | Tempo médio para especificar uma feature completa | Demonstrável em demo |
| O3 | Promover reúso de conhecimento | Nº de requisitos criados a partir de uma sugestão do acervo | ≥ 30% dos requisitos na demo |
| O4 | Tornar o acervo consultável | Bateria de 20 perguntas de teste respondidas com fonte citada corretamente | ≥ 80% |
| O5 | Mapear conhecimento da equipe | Perguntas do tipo "quem já trabalhou com X?" respondidas corretamente | ≥ 80% |
| O6 | Acelerar onboarding | Novo integrante responde perguntas sobre um projeto que não conhece usando só o chat | Validado em teste |

## 5. Personas

| Persona | Quem é | Dor principal | O que espera da plataforma |
|---|---|---|---|
| **Product Owner** (primária) | Um dos 4 POs da fábrica | Começa do zero toda vez; esquece de perguntar coisas; não lembra do que já foi feito | Um copiloto que questione, padronize e lembre do passado |
| **Desenvolvedor / Tech Lead** | Implementa a feature | Requisito vago, sem critério de aceite, sem o "porquê" | Especificação clara e rastreável |
| **Gestor / Head de Delivery** | Monta squads e estima | Não sabe quem no time domina o quê | Mapa de competências e histórico real de atuação |
| **Novo integrante** | Entrou agora na fábrica | Leva meses pra entender o legado | Chat que responde sobre qualquer projeto antigo |

## 6. Escopo

### 6.1. Dentro do escopo

- Cadastro estruturado de `Projeto → Épico → Feature → Requisito`, seguindo os **modelos
  documentais da PRO4TECH** (a serem fornecidos — ver dependência D2)
- Template padronizado de requisito, com critérios de aceite e registro de decisões
- Ingestão de conhecimento por upload de documentos, com isolamento por projeto
- Copiloto de IA no levantamento (questionador, padronizador, buscador de similares)
- Busca semântica + textual sobre todo o acervo
- Chat conversacional com RAG, com citação obrigatória de fontes
- Base de competências e histórico de atuação dos desenvolvedores
- Recomendação de profissionais com maior afinidade para uma nova demanda
- Autenticação e perfis de acesso

### 6.2. Fora do escopo (explicitado pelo cliente)

> **Não é uma ferramenta de gestão de projetos** — isso permanece no **Azure DevOps**.

Não construir: Sprints · Kanban · Controle de horas · Gestão de tarefas · Burndown.

Também fora do escopo nesta entrega:
- Geração de código a partir do requisito
- Integração bidirecional com Azure DevOps / Jira / Git *(desejável como evolução futura)*
- App mobile nativo
- Multi-tenant com isolamento entre clientes finais

### 6.3. Escopo condicional — a decidir com o cliente

Ideias levantadas na reunião técnica do grupo que **ainda não foram validadas** com a
PRO4TECH. Ver seção 15.

| Ideia | Valor | Risco |
|---|---|---|
| Estimativa de esforço (story points / nº de sprints) com base no histórico | Alto — usa o acervo para planejar | Tangencia a fronteira "não é gestão de projetos" |
| Sugestão de stack tecnológica para um novo projeto | Alto — padroniza decisões técnicas | Baixo |
| Ingestão de transcrições de reuniões PO↔cliente como contexto do projeto | Muito alto — captura o conhecimento na origem | Escopo e LGPD |
| Cadastro de repositório Git / board como fonte de contexto | Médio | Integração externa |

## 7. Modelo de domínio

```
Projeto ──1:N──> Épico ──1:N──> Feature ──1:N──> Requisito ──1:N──> CritérioDeAceite
   │                               │                 │
   │                               │                 └──N:N──> Tecnologia/Tag
   │                               └──N:N──> Tecnologia/Tag
   ├──1:N──> Documento (upload)
   └──N:N──> Desenvolvedor (via Alocação: papel, período)

Decisão ──> anexável a Projeto | Épico | Feature | Requisito   (registra o "porquê")

Desenvolvedor ──N:N──> Competência (tecnologia + nível + evidência)

Qualquer conteúdo textual ──> Chunk ──> Embedding   (alimenta busca e chat)
```

> ⚠️ A hierarquia inclui **Épico** porque o cliente se comprometeu a enviar sua estrutura
> interna de *epic / feature / backlog*. A modelagem final deve **seguir a estrutura da
> PRO4TECH**, não uma inventada por nós — ver dependência D2.

### 7.1. O template de requisito (artefato central)

O padrão de documentação é o coração do produto — é ele que resolve "cada PO documenta de um
jeito". **Sujeito a ajuste** quando os modelos documentais da PRO4TECH chegarem.

| Campo | Obrigatório | Descrição |
|---|:---:|---|
| Código | auto | Identificador único e estável (ex.: `PROJ-FEAT-RF-001`) |
| Título | ✅ | Frase curta e acionável |
| Tipo | ✅ | Funcional · Não-funcional · Regra de negócio · Integração |
| Descrição | ✅ | O que o sistema deve fazer |
| Ator | ✅ | Quem executa / quem é impactado |
| Critérios de aceite | ✅ | Formato Gherkin (`Dado / Quando / Então`), 1..N |
| Regras de negócio | — | Restrições e cálculos aplicáveis |
| Prioridade | ✅ | MoSCoW (Must · Should · Could · Won't) |
| Tecnologias / integrações | — | Tags: PIX, WhatsApp, Azure, OAuth… |
| Dependências | — | Outros requisitos relacionados ou bloqueantes |
| Decisões e justificativas | — | O "porquê": contexto, decisão, alternativas descartadas |
| Status | ✅ | Rascunho · Em revisão · Aprovado · Obsoleto |
| Proveniência | auto | Origem de cada campo: humano · IA aceita · IA editada |
| Versão / histórico | auto | Toda alteração é versionada |

**Score de completude (0–100):** calculado a partir dos campos preenchidos + heurísticas da
IA (ambiguidade, ausência de caso de falha, critério não testável). Exibido no editor como
feedback contínuo ao PO.

## 8. Requisitos funcionais

Prioridade: **M**ust · **S**hould · **C**ould

### E1 — Gestão de Projetos, Épicos e Features

| ID | Requisito | Pri |
|---|---|:---:|
| RF-01 | Criar, editar, listar e arquivar Projetos (nome, cliente, descrição, período, status, tags) | M |
| RF-02 | Criar, editar, listar e arquivar Épicos e Features dentro de um Projeto | M |
| RF-03 | Visualizar a árvore `Projeto → Épico → Feature → Requisito` com navegação e filtros | M |
| RF-04 | Marcar tecnologias/integrações via vocabulário controlado de tags | S |

### E2 — Requisitos estruturados

| ID | Requisito | Pri |
|---|---|:---:|
| RF-05 | Criar requisito seguindo o template padrão da seção 7.1 | M |
| RF-06 | Cadastrar N critérios de aceite em formato Gherkin | M |
| RF-07 | Calcular e exibir o score de completude do requisito em tempo real | S |
| RF-08 | Versionar toda alteração em requisito, com histórico consultável | S |
| RF-09 | Registrar decisões e justificativas anexáveis a projeto, épico, feature ou requisito | M |
| RF-10 | Relacionar requisitos entre si (depende de · similar a · substitui) | S |
| RF-11 | Exportar a especificação de uma feature (Markdown / PDF) | C |

### E3 — Copiloto de IA no levantamento

| ID | Requisito | Pri |
|---|---|:---:|
| RF-12 | **Modo questionador:** a partir do rascunho do PO, gerar perguntas sobre lacunas, ambiguidades e casos não cobertos | M |
| RF-13 | **Modo padronizador:** propor o texto do PO reescrito no template padrão, como sugestão editável | M |
| RF-14 | **Modo memória:** sugerir requisitos semelhantes já existentes no acervo enquanto o PO escreve | M |
| RF-15 | Sugerir critérios de aceite em Gherkin a partir da descrição | S |
| RF-16 | Toda sugestão da IA exige ação explícita: aceitar · editar · descartar — nada é salvo automaticamente | M |
| RF-17 | Registrar a proveniência de cada campo (humano · IA aceita · IA editada) | S |
| RF-18 | Permitir ao PO ignorar completamente a IA e escrever tudo manualmente | M |
| RF-19 | O comportamento da IA é regido por um **harness** configurável (ver seção 10.4), alinhado à cultura de engenharia e às práticas de DevOps da PRO4TECH | S |

### E4 — Ingestão de conhecimento

| ID | Requisito | Pri |
|---|---|:---:|
| RF-20 | Upload de documentos (PDF, DOCX, MD, TXT) vinculados a um Projeto | M |
| RF-21 | Processar o documento: extrair texto, fragmentar, gerar embeddings e indexar | M |
| RF-22 | **Isolamento por projeto:** todo conteúdo é vinculado ao seu projeto de origem, com filtro obrigatório na recuperação | M |
| RF-23 | Remover do índice todo o conteúdo de um projeto (expurgo de contexto) | M |
| RF-24 | Listar os documentos de um projeto, com status de processamento | S |
| RF-25 | Ingerir transcrições de reuniões PO↔cliente como contexto do projeto | C |
| RF-26 | Cadastrar link do repositório Git / board do projeto como metadado | C |

### E5 — Base de conhecimento e busca

| ID | Requisito | Pri |
|---|---|:---:|
| RF-27 | Indexar automaticamente todo conteúdo criado/alterado (projeto, épico, feature, requisito, decisão, perfil de dev) | M |
| RF-28 | Busca híbrida: semântica (vetorial) + textual (palavra-chave), com fusão de resultados | M |
| RF-29 | Filtrar busca por projeto, tipo, tecnologia, status e período | M |
| RF-30 | Exibir resultado com trecho de contexto e link para a origem | M |
| RF-31 | Reindexação incremental ao editar; remoção do índice ao arquivar | S |

### E6 — Chat sobre o acervo

| ID | Requisito | Pri |
|---|---|:---:|
| RF-32 | Chat em linguagem natural sobre todo o conhecimento armazenado | M |
| RF-33 | **Toda resposta cita as fontes** (projeto/feature/requisito/documento) com link navegável | M |
| RF-34 | Responder "não encontrei essa informação na base" quando não houver evidência — nunca inventar | M |
| RF-35 | Escopo do chat selecionável: toda a base · um projeto · uma feature | M |
| RF-36 | Histórico de conversas persistido por usuário | S |
| RF-37 | Resposta em streaming (token a token) | C |

### E7 — Conhecimento sobre quem desenvolve

| ID | Requisito | Pri |
|---|---|:---:|
| RF-38 | Cadastrar desenvolvedores com perfil (nome, senioridade, bio) | M |
| RF-39 | Registrar competências técnicas por tecnologia, com nível e evidência | M |
| RF-40 | Registrar alocação em projetos/features, com papel e período | M |
| RF-41 | Consolidar o histórico de atuação a partir das alocações e dos requisitos que passaram pelo profissional | S |
| RF-42 | Responder no chat consultas do tipo "quem já trabalhou com integração PIX?" | M |
| RF-43 | **Recomendar profissionais** com maior afinidade para uma nova feature, com base nas tecnologias envolvidas e no histórico | S |

### E8 — Inteligência sobre o acervo *(condicional — validar com o cliente)*

| ID | Requisito | Pri |
|---|---|:---:|
| RF-44 | Sugerir a stack tecnológica para um novo projeto, com base em projetos passados de escopo similar | C |
| RF-45 | Sugerir a composição do squad (ex.: 2 front, 1 back, 1 de banco) para um novo projeto | C |
| RF-46 | Estimar esforço (story points / nº de sprints) com base em entregas similares anteriores | C |

### E9 — Acesso e administração

| ID | Requisito | Pri |
|---|---|:---:|
| RF-47 | Autenticação com e-mail e senha | M |
| RF-48 | Perfis de acesso: Administrador · Product Owner · Desenvolvedor (leitura) | S |
| RF-49 | Gestão do vocabulário controlado de tecnologias/tags | S |

## 9. Requisitos não-funcionais

| ID | Requisito |
|---|---|
| RNF-01 | **IA sempre assistiva** — nenhuma escrita automática em base sem confirmação humana (RF-16) |
| RNF-02 | **Anti-alucinação** — o chat só afirma o que está na base recuperada e sempre cita a fonte |
| RNF-03 | **100% local e offline** — todo o stack de IA roda sem dependência de serviços em nuvem; nenhum dado sai da máquina. Restrição dura definida pelo grupo |
| RNF-04 | **Somente open source** — toda a solução construída sobre ferramentas de código aberto |
| RNF-05 | **Idioma** — toda a experiência e o pipeline de IA otimizados para português do Brasil |
| RNF-06 | **Desempenho** — busca semântica responde em < 2s; primeira resposta do chat em < 5s |
| RNF-07 | **Usabilidade** — o PO consegue especificar uma feature completa sem treinamento prévio |
| RNF-08 | **Rastreabilidade** — todo dado tem autor, data e histórico de versões |
| RNF-09 | **LGPD** — dados de competências dos desenvolvedores são profissionais, com consentimento e acesso restrito |
| RNF-10 | **Portabilidade** — aplicação sobe em qualquer máquina via containers, com um comando |
| RNF-11 | **Manutenibilidade** — código versionado no GitHub, com CI executando testes a cada PR |
| RNF-12 | **Documentação** — API documentada (OpenAPI/Swagger) e README de instalação |

## 10. Arquitetura

### 10.1. Stack definida

| Camada | Tecnologia | Observação |
|---|---|---|
| Frontend | **React** | SPA |
| Backend de aplicação | **Node.js** | API REST, autenticação, CRUD, regras de negócio |
| Orquestração de IA | **Python** | Serviço dedicado: embeddings, RAG, harness, chamadas ao LLM |
| Banco relacional | **PostgreSQL** | Dados estruturados |
| Banco vetorial | **pgvector** *(preferido)* ou **ChromaDB** | Local e offline. Pinecone **descartado** por ser cloud |
| Pipeline de ingestão | **n8n** | Orquestra upload → extração → chunking → embedding → indexação |
| LLM | Modelo aberto executado **localmente** | Ver 10.5 |
| Versionamento / CI | **GitHub** | |

> **Recomendação: adotar pgvector.** Postgres já será necessário para os dados relacionais;
> usar `pgvector` evita um segundo banco na infraestrutura, permite `JOIN` entre vetor e
> metadados na mesma query (essencial para o filtro por projeto do RF-22) e simplifica o
> backup. ChromaDB fica como plano B.

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
                    │  RAG · harness   │        │  documentos      │
                    └────────┬─────────┘        └──────────────────┘
                             │
                    ┌────────▼─────────┐
                    │  LLM local +     │
                    │  modelo de       │
                    │  embeddings      │
                    └──────────────────┘
```

**Fronteira entre Node e Python** — dois runtimes exigem contrato explícito:

- **Node.js** — tudo que é aplicação: autenticação, CRUD, permissões, validação, versionamento.
  É o único que escreve nas tabelas de negócio.
- **Python** — tudo que é IA: geração de embeddings, recuperação, montagem de contexto,
  harness, chamada ao LLM. Expõe uma API interna consumida pelo Node.
- Regra: **o serviço de IA nunca escreve direto na base de negócio** — ele devolve sugestões,
  e o Node persiste após a confirmação do usuário. Isso é o que garante o RNF-01 na
  arquitetura, e não só na interface.

### 10.3. Pipeline de RAG

**Ingestão:**
1. Upload de documento ou criação/edição de entidade dispara a indexação
2. Extração de texto → fragmentação (*chunking*) → enriquecimento com metadados
   (`projeto_id`, `feature_id`, `tipo`, `tecnologias[]`, `status`, `data`)
3. Geração do embedding e gravação no índice vetorial

**Consulta:**
1. Query do usuário → embedding
2. **Filtro obrigatório por metadados** (projeto/escopo) aplicado na query
3. **Busca híbrida** — vetorial (similaridade) **+** textual (full-text em português),
   resultados fundidos por *Reciprocal Rank Fusion*
   > A busca textual é essencial: termos como "PIX", "WhatsApp" e "OAuth" precisam de
   > match exato, onde a busca puramente semântica falha.
4. Top-K chunks montam o contexto
5. LLM responde **apenas** com base no contexto, citando as fontes
6. Sem contexto relevante → resposta é "não encontrei na base"

#### ⚠️ Duas correções técnicas em relação ao discutido na reunião

**1. Isolamento por projeto exige filtro de metadados, não proximidade vetorial.**
Foi dito na reunião que "se dois vetores estão próximos, são do mesmo projeto". Isso não se
sustenta: proximidade vetorial mede **similaridade semântica**, não pertencimento. O requisito
de login do Projeto A e o do Projeto B ficarão vizinhos justamente por serem parecidos — que é
o comportamento desejado para o *modo memória* (RF-14) e desastroso para o isolamento (RF-22).
**Solução:** `projeto_id` como coluna indexada, com filtro aplicado na query. Com `pgvector`
isso é um `WHERE` na mesma consulta.

**2. Chunk de 246 caracteres com overlap de 100 é pequeno demais.**
246 caracteres ≈ 40–60 tokens: menos que um parágrafo, o que parte uma regra de negócio no
meio e devolve fragmentos sem sentido ao LLM. E 100 de overlap sobre 246 significa **41% de
redundância**, inflando o índice sem ganho proporcional.
**Proposta:**
- **Conteúdo estruturado** (requisito, feature, decisão): *não* fragmentar por tamanho fixo —
  cada requisito é **um chunk**, com seus campos concatenados. A unidade semântica já existe.
- **Documentos enviados por upload**: fragmentação de **800–1200 caracteres** com overlap de
  **~150** (12–15%), preferindo quebrar em fronteiras de parágrafo.
- Medir com a bateria de perguntas de teste antes de fixar o número.

### 10.4. Harness — a camada de comportamento da IA

Proposta de Emmanuel Garakis na reunião técnica, inspirada em implementações open-source
recentes: envolver o RAG em um **harness em formato de plugin**.

**O que é.** O harness é a camada de ferramentação e instrução que define *como* o modelo age —
a diferença entre usar uma LLM em modo chat genérico e usá-la especializada em um domínio.
São as "rédeas": o que ela pode fazer, em que formato responde, o que nunca faz.

**Por que importa aqui.** É onde o princípio da seção 3.2 vira comportamento concreto:

- Instruções que fazem o modelo **perguntar antes de redigir**
- Formato de saída fixo (o template de requisito da seção 7.1)
- Vocabulário e práticas de engenharia da PRO4TECH (Scrum, DevOps, estrutura de épicos)
- Regra dura de citar fonte e recusar resposta sem evidência
- Ferramentas que o modelo pode acionar: buscar no acervo, consultar competências, listar
  projetos por tecnologia

**Formato de plugin** — um harness por modo de operação (levantamento · chat · recomendação de
equipe), trocável sem alterar o núcleo do RAG. É o principal diferencial técnico do projeto.

### 10.5. Modelos locais (recomendação)

| Componente | Recomendação | Por quê |
|---|---|---|
| Runtime do LLM | **Ollama** | Instalação trivial, API HTTP, roda em macOS/Linux/Windows |
| LLM | **Qwen 2.5 7B Instruct** ou **Llama 3.1 8B Instruct** | Bom desempenho em PT-BR e em seguir formato estruturado; cabem em 8–16 GB |
| Embeddings | **BAAI/bge-m3** ou **intfloat/multilingual-e5-base** | Multilíngues de verdade — modelos só-inglês degradam muito em PT-BR |
| Reranking | bge-reranker-v2-m3 *(opcional)* | Ganho relevante de precisão se sobrar folga de hardware |
| Transcrição *(se RF-25 entrar)* | **Whisper** (open source, local) | Atende ao RNF-03 e RNF-04 |

⚠️ **Restrição de hardware.** LLM local exige máquina com GPU (≥ 8 GB VRAM) ou Apple Silicon
com memória unificada. Validar na primeira semana — ver risco R1.

## 11. Modelo de dados (esboço)

| Tabela | Campos principais |
|---|---|
| `usuario` | id, nome, email, senha_hash, papel, ativo |
| `projeto` | id, nome, cliente, descricao, status, repositorio_url, data_inicio, data_fim |
| `epico` | id, projeto_id, nome, objetivo, status |
| `feature` | id, epico_id, nome, objetivo, status |
| `requisito` | id, feature_id, codigo, titulo, tipo, descricao, ator, regras_negocio, prioridade, status, versao, score_completude, criado_por, criado_em |
| `criterio_aceite` | id, requisito_id, dado, quando, entao, ordem |
| `decisao` | id, entidade_tipo, entidade_id, contexto, decisao, justificativa, alternativas, autor, data |
| `documento` | id, projeto_id, nome, mime, caminho, status_processamento, enviado_por, enviado_em |
| `tecnologia` | id, nome, categoria |
| `entidade_tecnologia` | entidade_tipo, entidade_id, tecnologia_id |
| `requisito_relacao` | requisito_origem_id, requisito_destino_id, tipo_relacao |
| `requisito_versao` | id, requisito_id, snapshot_json, autor, data |
| `campo_proveniencia` | requisito_id, campo, origem (humano/ia_aceita/ia_editada) |
| `desenvolvedor` | id, usuario_id, senioridade, bio |
| `competencia` | id, desenvolvedor_id, tecnologia_id, nivel, evidencia |
| `alocacao` | id, desenvolvedor_id, projeto_id, feature_id, papel, data_inicio, data_fim |
| `conversa` | id, usuario_id, escopo_tipo, escopo_id, titulo, criada_em |
| `mensagem` | id, conversa_id, papel, conteudo, fontes_json, criada_em |
| `chunk` | id, entidade_tipo, entidade_id, **projeto_id**, texto, metadados_json, embedding |

> `chunk.projeto_id` é desnormalizado de propósito: é o que permite o filtro de isolamento
> (RF-22) e o expurgo por projeto (RF-23) sem `JOIN` na query vetorial.

## 12. Calendário e roadmap

### 12.1. Calendário oficial da disciplina — 2º Semestre 2026

| Evento | Data |
|---|---|
| Início das aulas | 03/08 |
| Kick-off geral | 24/08 a 28/08 |
| **Construção do Backlog de Produto / Planning** | **31/08 a 04/09** |
| **Sprint 1** | **07/09 a 27/09** |
| Sprint Review / Planning | 28/09 a 02/10 |
| **Sprint 2** | **05/10 a 25/10** |
| Sprint Review / Planning | 26/10 a 30/10 |
| **Sprint 3** | **02/11 a 22/11** |
| Sprint Review | 23/11 a 27/11 |
| **🎯 Feira de Soluções** | **03/12** |
| Apresentação de TGs | 07/12 a 11/12 |
| Encerramento das aulas | 14/12 |

Três sprints de **três semanas** cada.

### 12.2. Pré-sprint — Backlog e Planning (31/08 a 04/09)

- Traduzir este PRD em backlog de produto (épicos e user stories)
- Validar o PRD com a PRO4TECH (P5)
- Receber e analisar os materiais do cliente (D1, D2, D3)
- **Spike de hardware:** validar LLM local nas máquinas do grupo (R1)
- **Spike de modelo:** comparar 2–3 LLMs e 2 modelos de embedding em PT-BR (R3)
- Definir a estratégia de chunking com base em teste real (seção 10.3)
- Setup: repositório, containers, CI, ambientes

### 12.3. Sprint 1 — Fundação e cadastro estruturado (07/09 a 27/09)

**Entregável:** cadastrar `Projeto → Épico → Feature → Requisito` no padrão, com a base populada.

- Autenticação e perfis (RF-47, RF-48)
- CRUD de Projeto, Épico e Feature (RF-01 a RF-04)
- CRUD de Requisito com template padrão e critérios de aceite (RF-05, RF-06)
- Registro de decisões (RF-09)
- Upload de documentos com vínculo ao projeto (RF-20, RF-24)
- Infra do banco vetorial e do serviço Python, com ingestão ponta a ponta (RF-21, RF-22)
- **Seed da base** com os dados de projetos anteriores da PRO4TECH (D3) — se não chegarem,
  gerar 5–10 projetos fictícios realistas ⚠️ *ver risco R2*

### 12.4. Sprint 2 — Inteligência e reúso (05/10 a 25/10)

**Entregável:** o PO especifica com apoio da IA e encontra o que já foi feito.

- Indexação automática de todo conteúdo estruturado (RF-27, RF-31)
- Busca híbrida com filtros (RF-28 a RF-30)
- Primeira versão do harness (RF-19)
- Copiloto: modo questionador (RF-12) e padronizador (RF-13)
- Sugestão de requisitos similares durante a escrita (RF-14)
- Sugestão de critérios de aceite (RF-15)
- Controle de aceitar/editar/descartar e proveniência (RF-16, RF-17)
- Score de completude (RF-07)
- Expurgo de contexto por projeto (RF-23)

### 12.5. Sprint 3 — Conversa, pessoas e fechamento (02/11 a 22/11)

**Entregável:** produto completo, apresentável na Feira de Soluções.

- Chat RAG com citação obrigatória de fontes e escopo selecionável (RF-32 a RF-35)
- Histórico de conversas (RF-36)
- Base de competências e alocações (RF-38 a RF-41)
- Consultas de "quem sabe o quê" no chat (RF-42)
- Recomendação de profissionais por afinidade (RF-43)
- Versionamento e histórico de requisitos (RF-08)
- Itens condicionais de E8, **se e somente se** os `Must` estiverem completos
- Polimento de UX, documentação, roteiro de demonstração

### 12.6. Reta final (23/11 a 03/12)

- Sprint Review final (23/11 a 27/11)
- Ensaio da apresentação e preparação do material da Feira
- Congelamento de código: **28/11**. Só correção de bug crítico depois disso.

## 13. Definição de pronto (DoD)

- [ ] Código revisado por outro integrante e integrado via Pull Request
- [ ] Testes automatizados dos fluxos principais passando na CI
- [ ] Funcionalidade demonstrável em ambiente executável por comando único
- [ ] Endpoints documentados (OpenAPI)
- [ ] Sem regressão nos fluxos das sprints anteriores
- [ ] Documentação do repositório atualizada

## 14. Riscos

| # | Risco | Impacto | Mitigação |
|---|---|:---:|---|
| R1 | Hardware do grupo insuficiente para rodar o LLM local com desempenho aceitável | 🔴 Alto | Spike na semana de planning; modelo quantizado menor; eleger uma máquina do grupo como servidor de IA compartilhado na rede |
| R2 | **Cold start** — a proposta de valor é reúso, mas a base começa vazia | 🔴 Alto | Cobrar a entrega D3 (dados de projetos anteriores). Plano B: seed de 5–10 projetos fictícios realistas com temas sobrepostos (PIX, WhatsApp, login) |
| R3 | Qualidade do modelo aberto em PT-BR abaixo do necessário | 🟠 Médio | Comparar 2–3 modelos no spike; o pipeline de recuperação pesa mais que o tamanho do modelo |
| R4 | **Escopo amplo** — 49 requisitos e 4 eixos para 3 sprints de 3 semanas | 🔴 Alto | MoSCoW rígido; E8 é condicional; nenhum `Should` começa antes de todos os `Must` fecharem |
| R5 | Dependências do cliente (D1–D3) não chegarem a tempo | 🟠 Médio | Cobrar formalmente até 04/09; ter plano B para cada uma; não bloquear a Sprint 1 |
| R6 | Alucinação do chat destruindo a confiança na demo | 🟠 Médio | Citação obrigatória + recusa sem evidência (RF-33, RF-34); bateria de 20 perguntas de regressão rodada a cada sprint |
| R7 | Dois runtimes de backend (Node + Python) gerando retrabalho e acoplamento confuso | 🟠 Médio | Contrato de fronteira explícito (seção 10.2); API interna versionada; um dono por serviço |
| R8 | n8n como dependência de infraestrutura em ambiente 100% local | 🟡 Baixo | Manter a lógica de ingestão desacoplada do n8n, para poder migrar ao serviço Python se pesar |
| R9 | LGPD nos dados de competências dos desenvolvedores | 🟡 Baixo | Apenas dados profissionais, com consentimento; perfis de acesso restritos |

## 15. Perguntas abertas para o cliente

Levantadas na reunião técnica do grupo e ainda **sem resposta da PRO4TECH**:

| # | Pergunta | Por que importa |
|---|---|---|
| Q1 | O PO usa a plataforma **como ferramenta principal de especificação** (e depois exporta pro Azure DevOps), ou ela é só um **repositório consultivo** alimentado depois? | Muda completamente a UX e o peso do CRUD vs. do chat |
| Q2 | Estimativa de esforço (story points / sprints) baseada no histórico está dentro ou fora do escopo? | Tangencia a fronteira "não é gestão de projetos" (RF-46) |
| Q3 | Faz sentido ingerir transcrições de reuniões PO↔cliente como contexto? | Alto valor, mas amplia escopo e levanta questão de privacidade (RF-25) |
| Q4 | Qual a estrutura documental oficial de épico / feature / backlog da PRO4TECH? | Define o modelo de dados e o template de requisito (D2) |
| Q5 | Há integração desejada com o Azure DevOps, mesmo que só de leitura? | Definiria uma fonte de dados rica, hoje fora do escopo |
| Q6 | Quantos usuários simultâneos e qual volume de projetos a plataforma deve suportar? | Dimensiona a infraestrutura de IA local |

## 16. Dependências do cliente

Compromissos assumidos pela PRO4TECH na reunião de kickoff:

| # | Entrega | Status | Impacto se atrasar |
|---|---|---|---|
| D1 | Apresentação institucional da empresa | ⏳ Aguardando | Baixo |
| D2 | Modelos de estruturação de projeto: **feature, epic e backlog** | ⏳ Aguardando | 🔴 Alto — define o modelo de dados e o template de requisito |
| D3 | Dados de projetos anteriores para compor a base de conhecimento inicial | ⏳ Aguardando | 🔴 Alto — sem isso, o cold start (R2) volta com força |

**Prazo sugerido para cobrança: 04/09** (fim da semana de planning).

## 17. Pendências internas

| # | Pendência | Responsável |
|---|---|---|
| P1 | Registrar integrantes do grupo, papéis, Scrum Master e PO | Time |
| P2 | Critérios de avaliação da disciplina | Time |
| P3 | Definir o nome definitivo do produto | Time |
| P4 | Confirmar o nome do contato da PRO4TECH — as fontes divergem entre *Rafael Matesco* e *Rafael Monteiro* | Time |
| P5 | Validar este PRD com o cliente e levar as perguntas da seção 15 | PO do grupo |
| P6 | Definir a estratégia final de chunking com base em teste medido | Time de IA |
