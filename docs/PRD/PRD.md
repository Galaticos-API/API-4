# PRD — Sinapse
### Base Inteligente de Requisitos · API 4º Semestre · 2º Semestre 2026 · Grupo Galáticos

> **Nome provisório.** "Sinapse" é sugestão — alternativas: *Mnemo*, *Acervo*, *Córtex*, *Memória*.

| | |
|---|---|
| **Instituição** | Fatec São José dos Campos — Prof. Jessen Vidal / Centro Paula Souza |
| **Cliente / Parceiro acadêmico** | PRO4TECH — Digital Tech Transformation |
| **Contato do cliente** | Rafael Monteiro (PRO4TECH) |
| **Período** | 03/08/2026 a 14/12/2026 · Feira de Soluções em **03/12/2026** |
| **Fontes** | [Kick-off.md](./Kick-off.md) · Ata do kickoff (24/08) · Reunião técnica do grupo (24/08) · **Guia de Especificação de Itens de Trabalho (PRO4TECH, 25/08)** |
| **Status** | 🟡 Rascunho — pendente de validação com o cliente |
| **Versão** | 1.1 — 02/09/2026 |

> **Revisão 1.1.** Fecha também a decisão sobre o n8n: mantido, com versionamento de
> workflows via `n8n-local-sync` (seção 10.6) e a fronteira de ingestão fixada na seção 10.1.
> Alinha o documento ao *Guia de Especificação de Itens de Trabalho*
> entregue pela PRO4TECH em 25/08. Mudanças estruturais: a hierarquia passa a ser
> `Projeto → Épico → Feature → PBI` (a entidade "Requisito" deixa de existir), cada nível
> ganha estrutura obrigatória própria, e o checklist de qualidade do cliente passa a ser a
> base do score de completude e do copiloto. **Os identificadores RF foram renumerados**
> nesta revisão — o backlog ainda não havia sido construído.

---

## 1. Contexto

A PRO4TECH é uma fábrica de software que atua com apps web e nativos, Inteligência
Artificial, Business Intelligence, automação de processos (RPA/Python), IoT e consultoria de
redesenho de processos de negócio. Trabalha com Scrum, execução por squads e esteira de
DevOps integrada, controlada e monitorada após as liberações.

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

Uma plataforma onde o Product Owner estrutura o backlog de produto e usa Inteligência
Artificial **como apoio** durante o levantamento de requisitos — construindo, como efeito
colateral do trabalho normal, a **memória da fábrica de software**.

1. **Levantamento inteligente** — `Projeto → Épico → Feature → PBI`, no padrão documental da
   PRO4TECH, com a IA ajudando o PO a detalhar necessidades, identificar informações
   faltantes, padronizar a documentação, consultar itens semelhantes e produzir uma
   especificação estruturada.
2. **Base de conhecimento** — todo conteúdo criado alimenta um acervo reutilizável e
   pesquisável semanticamente. *"Já tivemos alguma integração com pagamento via PIX?"*
3. **Chat sobre projetos** — conversar com todo o conhecimento armazenado, servindo também
   como ferramenta de onboarding.
4. **Conhecimento sobre quem desenvolve** — competências, experiência e histórico de atuação,
   apoiando a formação de squads.

### 3.1. Os três pilares de contexto

```
        PROJETOS  ←→  PESSOAS  ←→  TECNOLOGIAS / STACKS
           ↑                              ↑
           └──── itens de backlog ────────┘
```

### 3.2. Princípio de produto inegociável

> **A IA não escreve requisitos sozinha. Ela ajuda o PO a pensar melhor sobre eles.**

- Toda saída da IA é **sugestão**, nunca conteúdo salvo automaticamente.
- Toda sugestão exige **ação humana explícita**: aceitar, editar ou descartar.
- O sistema registra a **proveniência** de cada campo (humano · IA aceita · IA editada).
- O modo primário da IA é **perguntar**, não redigir.

Garantido em arquitetura, não só em interface: o serviço de IA não tem permissão de escrita
na base de negócio (seção 10.2).

### 3.3. Fronteira de escopo

A gestão da execução dos projetos **continua no Azure DevOps**.

| Isto NÃO é | Isto É |
|---|---|
| Gestão da execução do projeto | Gestão do **conhecimento** sobre o projeto |
| Sprints, kanban, horas, tarefas, burndown | Backlog especificado, decisões, competências, histórico |
| Onde a equipe acompanha o trabalho | Onde a equipe **consulta o que já foi aprendido** |

## 4. Objetivos e métricas de sucesso

| # | Objetivo | Métrica | Meta |
|---|---|---|---|
| O1 | Padronizar a documentação | Itens aprovados no checklist de qualidade da PRO4TECH (seção 7.5) | ≥ 90% |
| O2 | Reduzir o esforço de especificação | Tempo médio para especificar uma Feature completa | Redução demonstrável |
| O3 | Promover reúso de conhecimento | PBIs criados a partir de uma sugestão do acervo | ≥ 30% |
| O4 | Tornar o acervo consultável | Bateria de 20 perguntas com fonte citada corretamente | ≥ 80% |
| O5 | Mapear conhecimento da equipe | Consultas "quem já trabalhou com X?" respondidas corretamente | ≥ 80% |
| O6 | Acelerar onboarding | Novo integrante responde sobre projeto desconhecido só com o chat | Validado em teste |

## 5. Personas

| Persona | Quem é | Dor principal | O que espera |
|---|---|---|---|
| **Product Owner** (primária) | Um dos 4 POs da fábrica | Começa do zero toda vez; esquece de perguntar coisas | Copiloto que questiona, padroniza e lembra do passado |
| **Desenvolvedor / Tech Lead** | Implementa o PBI | Item vago, sem cenário testável, sem o "porquê" | Especificação clara e rastreável |
| **Gestor de Delivery** | Monta squads e estima | Não sabe quem domina o quê | Mapa de competências e histórico real |
| **Novo integrante** | Entrou agora | Leva meses pra entender o legado | Chat que responde sobre qualquer projeto antigo |

## 6. Escopo

### 6.1. Dentro do escopo

- Cadastro estruturado de `Projeto → Épico → Feature → PBI` **no padrão documental da PRO4TECH**
- Validação automática da especificação contra o checklist de qualidade do cliente
- Ingestão de conhecimento por upload de documentos, com isolamento por projeto
- Copiloto de IA no levantamento (questionador, padronizador, memória)
- Busca semântica + textual sobre todo o acervo
- Chat com RAG e citação obrigatória de fontes
- Base de competências e histórico de atuação dos desenvolvedores
- Recomendação de profissionais por afinidade
- Autenticação e perfis de acesso

### 6.2. Fora do escopo

> **Não é ferramenta de gestão de projetos** — isso permanece no **Azure DevOps**.

Não construir: Sprints · Kanban · Controle de horas · Gestão de tarefas · Burndown.

O guia da PRO4TECH admite **tarefas técnicas abaixo do PBI**. Essas tarefas são explicitamente
**fora do nosso escopo** — pertencem à execução, que fica no Azure DevOps. O PBI é a folha da
nossa hierarquia.

Também fora desta entrega: geração de código · integração bidirecional com Azure DevOps, Jira
ou Git · app mobile nativo · multi-tenant entre clientes finais.

### 6.3. Escopo condicional — a validar com o cliente

| Ideia | Valor | Risco |
|---|---|---|
| Estimativa de esforço com base no histórico | Alto | Tangencia a fronteira; ver Q2 |
| Sugestão de stack tecnológica | Alto | Baixo |
| Sugestão de composição de squad | Médio | Baixo |
| Ingestão de transcrições de reuniões PO↔cliente | Muito alto | Escopo e LGPD |
| Cadastro de repositório Git como fonte de contexto | Médio | Integração externa |

## 7. Modelo de domínio

```
Projeto ──1:N──> Épico ──1:N──> Feature ──1:N──> PBI
   │                │              │              ├──1:N──> CritérioAceitação (cenário)
   │                │              │              ├──0:N──> Protótipo (imagem)
   │                │              │              └──N:N──> Tecnologia
   │                │              └──1:N──> CritérioAceitação (regra geral)
   │                └──1:N──> CritérioAceitação (condição macro)
   ├──1:N──> Documento (upload)
   └──N:N──> Desenvolvedor (via Alocação: papel, período)

Decisão ──> anexável a qualquer nível   (extensão nossa — ver 7.4)

Desenvolvedor ──N:N──> Competência (tecnologia + nível + evidência)

Qualquer conteúdo textual ──> Chunk ──> Embedding
```

> **`Projeto` é adição nossa.** O guia da PRO4TECH começa em Épico e não menciona um nível
> acima. Mantivemos Projeto porque o kickoff pedia "Criar Projeto" e porque ele é a chave do
> isolamento de contexto (RF-31). **Confirmar com o cliente** — ver Q4.

### 7.1. Estrutura do Épico

> *Que resultado amplo queremos alcançar?* — granularidade alta, foco em resultado,
> abrangência e limites.

| Campo | Obrigatório | Como escrever |
|---|:---:|---|
| Título | ✅ | Nome curto da iniciativa. Compreensível fora do contexto de uma reunião |
| Descrição | ✅ | O que será construído ou alterado, para quem e em qual contexto de uso |
| Objetivo | ✅ | Propósito e valor esperado — por que o Épico existe |
| Escopo macro | ✅ | Grandes grupos de capacidades incluídos, sem descer a telas, campos ou regras |
| Resultado esperado | ✅ | Estado desejado após a conclusão, do ponto de vista de uso ou operação |
| Critérios de aceitação | ✅ | Condições **amplas** e verificáveis: abrangência, integrações, segurança, continuidade |

**Nível dos critérios.** Devem permanecer macro e validar requisitos transversais.
- ✅ *"Os dados alterados em um canal devem permanecer consistentes nos demais canais suportados."*
- ❌ *"Ao clicar no botão X, o campo Y deve ficar com borda vermelha."* — isso é PBI.

### 7.2. Estrutura da Feature

> *Que capacidade o produto precisa oferecer?* — granularidade média, foco em comportamento
> funcional e regras gerais.

| Campo | Obrigatório | Como escrever |
|---|:---:|---|
| Título | ✅ | Nome curto da capacidade funcional. Evitar "Ajustes" ou "Melhorias" |
| Descrição | ✅ | A capacidade, seu contexto e os principais comportamentos contemplados |
| Objetivo | ✅ | Benefício funcional ou operacional esperado |
| Critérios de aceitação | ✅ | Regras gerais, fluxos essenciais, restrições e condições de funcionamento |

**Teste para distinguir Feature de PBI:** se a capacidade ainda precisa ser dividida em
diferentes ações, estados ou fluxos para ser desenvolvida e testada com clareza, ela ainda é
uma Feature.

**Nível dos critérios:** cobrir regras que valem para mais de um PBI; incluir restrições de
acesso, integrações, segurança e tratamento de erros quando transversais; não detalhar cada
clique e campo.

### 7.3. Estrutura do PBI

> *Que comportamento específico será implementado?* — granularidade baixa, foco em cenários
> objetivos e testáveis. É a unidade implementável, demonstrável e testável.

| Campo | Obrigatório | Como escrever |
|---|:---:|---|
| Título | ✅ | **Verbo no infinitivo** + objeto. *Autenticar usuário · Consultar solicitações · Exportar relatório* |
| História do usuário | ✅ | `COMO UM [ator]` / `EU QUERO [ação]` / `PARA QUE [benefício]` |
| Protótipo ou referência visual | — | Anexar quando houver interface relevante. **Não substitui** critérios escritos |
| Critérios de aceitação | ✅ | Cenários independentes em `DADO / QUANDO / ENTÃO` |
| Regras e observações | — | Só quando necessário: dependências, restrições ou decisões que não cabem nos cenários |

A história do usuário **não carrega todas as regras** — ela dá contexto e intenção; os
detalhes verificáveis pertencem aos critérios.

**Cobertura mínima recomendada dos cenários** — esta lista é a base do modo questionador
(RF-20):

| # | Dimensão | O que cobrir |
|---|---|---|
| 1 | Caminho principal | O comportamento funcionando com dados válidos |
| 2 | Validações | Campos obrigatórios, formatos, limites, regras de negócio |
| 3 | Erros e indisponibilidade | Falhas de serviço, conexão ou integração |
| 4 | Permissões e segurança | Acesso autorizado, dados sensíveis, sessão |
| 5 | Estados alternativos | Ausência de dados, registro bloqueado, sessão expirada |
| 6 | Interface e compatibilidade | Responsividade, acessibilidade, dispositivos |

### 7.4. Extensões ao padrão

Campos **além** do guia da PRO4TECH. São opcionais e **nunca bloqueiam** o cadastro — o
padrão do cliente é o núcleo obrigatório.

| Campo | Nível | Por que mantemos |
|---|---|---|
| Decisões e justificativas | Qualquer | O kickoff pede rastreabilidade do "o que foi definido **e por quê**". O guia não cobre isso |
| Tipo (funcional · não-funcional · regra de negócio · integração) | PBI | Facilita filtro e busca no acervo |
| Prioridade (MoSCoW) | Épico, Feature, PBI | Necessária ao nosso próprio planejamento |
| Tecnologias / integrações | Todos | Chave para o reúso: é o que responde "já fizemos PIX?" |
| Relações entre itens | PBI | Depende de · similar a · substitui |

### 7.5. Checklist de qualidade da PRO4TECH

As 12 verificações do guia. **A maior parte é validável por código**, sem depender do LLM —
o que torna o score de completude (RF-13) determinístico e barato.

| Nível | Verificação | Como validamos |
|---|---|---|
| Épico | Tem descrição, objetivo, escopo macro, resultado esperado e critérios? | Campos preenchidos |
| Épico | Critérios estão em nível macro, sem detalhe de tela? | Heurística + IA |
| Feature | A capacidade está vinculada a um resultado do Épico? | Vínculo + IA |
| Feature | Pode ser decomposta em PBIs independentes? | Tem ≥ 1 PBI + IA |
| PBI | O título começa com verbo no infinitivo? | **Regex / análise morfológica** |
| PBI | A história tem `COMO UM / EU QUERO / PARA QUE`? | **Parsing** |
| PBI | Os critérios são testáveis e escritos em cenários? | **Parsing `DADO/QUANDO/ENTÃO`** |
| PBI | Cobre caminho principal, validações e erros relevantes? | IA, contra a tabela de 7.3 |
| PBI | O protótipo foi anexado quando necessário, sem substituir regras? | Anexo + critérios presentes |
| Geral | Termos vagos foram removidos? | **Lista de bloqueio**: adequado, rápido, intuitivo, correto, bonito |
| Geral | Não há informação conflitante entre níveis? | IA |
| Geral | Dependências e restrições estão explícitas? | Campo + IA |

**Antipadrões a detectar** (seção 7 do guia): Épico excessivamente técnico · Feature que é só
um PBI grande · PBI com título genérico · critério subjetivo · protótipo como única
especificação · critério que descreve implementação · duplicação entre níveis.

## 8. Requisitos funcionais

Prioridade: **M**ust · **S**hould · **C**ould

### E1 — Estrutura do backlog de produto

| ID | Requisito | Pri |
|---|---|:---:|
| RF-01 | Criar, editar, listar e arquivar Projetos | M |
| RF-02 | Criar, editar, listar e arquivar Épicos com a estrutura obrigatória de 7.1 | M |
| RF-03 | Criar, editar, listar e arquivar Features com a estrutura obrigatória de 7.2 | M |
| RF-04 | Criar, editar, listar e arquivar PBIs com a estrutura obrigatória de 7.3 | M |
| RF-05 | Navegar a árvore `Projeto → Épico → Feature → PBI` com filtros | M |
| RF-06 | Classificar itens por tecnologias e integrações via vocabulário controlado | S |

### E2 — Qualidade da especificação

| ID | Requisito | Pri |
|---|---|:---:|
| RF-07 | Registrar critérios de aceitação nos três níveis, com formato apropriado a cada um (condição macro · regra geral · cenário) | M |
| RF-08 | Validar que o título do PBI começa com verbo no infinitivo | M |
| RF-09 | Validar a presença dos três blocos da história do usuário | M |
| RF-10 | Validar que os critérios do PBI estão em cenários `DADO / QUANDO / ENTÃO` | M |
| RF-11 | Detectar termos vagos e sinalizá-los ao autor | S |
| RF-12 | Executar o checklist de qualidade (7.5) por nível, exibindo o que falta | M |
| RF-13 | Calcular e exibir o score de completude derivado do checklist, em tempo real | S |
| RF-14 | Sinalizar duplicação e conflito de informação entre níveis | C |

### E3 — Extensões ao padrão

| ID | Requisito | Pri |
|---|---|:---:|
| RF-15 | Registrar decisões e justificativas anexáveis a qualquer nível | M |
| RF-16 | Versionar alterações, com histórico consultável | S |
| RF-17 | Relacionar itens entre si (depende de · similar a · substitui) | S |
| RF-18 | Classificar PBI por tipo e prioridade, sem bloquear o cadastro | C |
| RF-19 | Exportar a especificação de um Épico ou Feature (Markdown / PDF) | C |

### E4 — Copiloto de IA no levantamento

| ID | Requisito | Pri |
|---|---|:---:|
| RF-20 | **Modo questionador** — apontar lacunas contra a cobertura mínima de 7.3 e o checklist de 7.5 | M |
| RF-21 | **Modo padronizador** — propor o texto reescrito na estrutura do nível correspondente, como sugestão editável | M |
| RF-22 | **Modo memória** — sugerir itens semelhantes do acervo durante a escrita | M |
| RF-23 | Sugerir cenários `DADO / QUANDO / ENTÃO` a partir da história do usuário | S |
| RF-24 | Exigir ação explícita sobre toda sugestão: aceitar · editar · descartar | M |
| RF-25 | Registrar a proveniência de cada campo | S |
| RF-26 | Permitir especificação inteiramente manual, sem uso da IA | M |
| RF-27 | Reger o comportamento da IA por **harness** configurável (seção 10.4) | S |

### E5 — Ingestão de conhecimento

| ID | Requisito | Pri |
|---|---|:---:|
| RF-28 | Upload de documentos (PDF, DOCX, MD, TXT) vinculados a um Projeto | M |
| RF-29 | Processar o documento: extrair, fragmentar, vetorizar e indexar | M |
| RF-30 | Anexar protótipo ou referência visual (PNG, JPG, PDF) a um PBI | S |
| RF-31 | **Isolar o conteúdo por projeto**, com filtro obrigatório na recuperação | M |
| RF-32 | Remover integralmente do índice o conteúdo de um projeto | M |
| RF-33 | Listar documentos de um projeto com status de processamento | S |
| RF-34 | Ingerir transcrições de reuniões como contexto do projeto | C |
| RF-35 | Registrar repositório e board do projeto como metadados | C |

### E6 — Base de conhecimento e busca

| ID | Requisito | Pri |
|---|---|:---:|
| RF-36 | Indexar automaticamente todo conteúdo criado ou alterado | M |
| RF-37 | Busca híbrida: semântica + textual, com fusão de resultados | M |
| RF-38 | Filtrar por projeto, nível, tecnologia, status e período | M |
| RF-39 | Exibir resultados com trecho de contexto e vínculo à origem | M |
| RF-40 | Reindexação incremental na edição e remoção no arquivamento | S |

### E7 — Chat sobre o acervo

| ID | Requisito | Pri |
|---|---|:---:|
| RF-41 | Chat em linguagem natural sobre todo o conhecimento armazenado | M |
| RF-42 | **Citar as fontes** em toda resposta, com vínculo navegável | M |
| RF-43 | Declarar ausência de informação quando não houver evidência na base | M |
| RF-44 | Selecionar o escopo: toda a base · um projeto · um Épico · uma Feature | M |
| RF-45 | Persistir o histórico de conversas por usuário | S |
| RF-46 | Exibir a resposta em streaming | C |

### E8 — Conhecimento sobre quem desenvolve

| ID | Requisito | Pri |
|---|---|:---:|
| RF-47 | Cadastrar desenvolvedores com perfil profissional | M |
| RF-48 | Registrar competências técnicas por tecnologia, com nível e evidência | M |
| RF-49 | Registrar alocação em projetos, épicos e features, com papel e período | M |
| RF-50 | Consolidar o histórico de atuação a partir das alocações e dos itens trabalhados | S |
| RF-51 | Responder consultas do tipo "quem já trabalhou com integração PIX?" | M |
| RF-52 | Recomendar profissionais com maior afinidade para uma nova demanda | S |

### E9 — Inteligência sobre o acervo *(condicional)*

| ID | Requisito | Pri |
|---|---|:---:|
| RF-53 | Sugerir stack tecnológica para novo projeto, com base em escopo similar | C |
| RF-54 | Sugerir composição de squad para um novo projeto | C |
| RF-55 | Estimar esforço com base em entregas anteriores semelhantes | C |

### E10 — Acesso e administração

| ID | Requisito | Pri |
|---|---|:---:|
| RF-56 | Autenticação com e-mail e senha | M |
| RF-57 | Perfis de acesso: Administrador · Product Owner · Desenvolvedor (leitura) | S |
| RF-58 | Gestão do vocabulário controlado de tecnologias | S |

## 9. Requisitos não-funcionais

| ID | Requisito |
|---|---|
| RNF-01 | **IA sempre assistiva** — nenhuma persistência sem confirmação humana |
| RNF-02 | **Anti-alucinação** — o chat afirma apenas o que consta na base recuperada, sempre com fonte |
| RNF-03 | **Execução 100% local e offline** — nenhum dado trafega para serviços externos |
| RNF-04 | **Ferramentas abertas e auto-hospedadas** — componentes de IA e de dados são open source. O n8n é *source-available* (Sustainable Use License, "fair-code"), não aprovada pela OSI: sem impedimento de uso, mas evitar a afirmação "integralmente open source" ao cliente |
| RNF-05 | **Português do Brasil** — interface e pipeline de IA otimizados para o idioma |
| RNF-06 | **Desempenho** — busca em < 2s; primeira resposta do chat em < 5s |
| RNF-07 | **Usabilidade** — especificar uma Feature completa sem treinamento prévio |
| RNF-08 | **Rastreabilidade** — autoria, data e histórico de versões em todo dado |
| RNF-09 | **Conformidade com o padrão do cliente** — a estrutura de Épico, Feature e PBI segue o *Guia de Especificação de Itens de Trabalho* da PRO4TECH |
| RNF-10 | **LGPD** — dados de competências restritos ao âmbito profissional, com consentimento |
| RNF-11 | **Portabilidade** — implantação via containers, com um comando |
| RNF-12 | **Manutenibilidade** — versionamento no GitHub, com CI executando testes a cada PR |
| RNF-13 | **Documentação** — API documentada em OpenAPI e README de instalação |

## 10. Arquitetura

### 10.1. Stack definida

| Camada | Tecnologia | Observação |
|---|---|---|
| Frontend | **React** | SPA |
| Backend de aplicação | **Node.js** | API REST, autenticação, CRUD, validações estruturais |
| Orquestração de IA | **Python** | Embeddings, RAG, harness, chamadas ao LLM |
| Banco relacional | **PostgreSQL** | Dados estruturados |
| Banco vetorial | **pgvector** *(preferido)* ou **ChromaDB** | Local e offline. Pinecone descartado por ser cloud |
| Orquestração de ingestão | **n8n** (self-hosted, container) | Workflows versionados via `n8n-local-sync` — ver abaixo |
| Versionamento de workflows | **`n8n-local-sync`** | Ferramenta própria da equipe, publicada no PyPI (MIT) |
| LLM | Modelo aberto executado **localmente** | Ver 10.5 |
| Versionamento / CI | **GitHub** | |

> **Recomendação: adotar pgvector.** Postgres já é necessário para os dados relacionais;
> `pgvector` evita um segundo banco, permite filtrar metadado e buscar vetor na mesma query
> (essencial para o RF-31) e simplifica o backup.

> **Decisão: n8n mantido, com fronteira definida.** O bloqueio original era a
> sincronização de workflows entre as máquinas do grupo — o *Source Control* via Git do n8n é
> recurso enterprise, e a community edition só permite `export`/`import` manual de JSON, sem
> diff revisável. A equipe resolveu isso construindo o **`n8n-local-sync`** (seção 10.6).

> ⚠️ **Fronteira obrigatória da ingestão.** O **chunking e o embedding pertencem ao serviço
> Python**, não aos nós do n8n. O risco não é manutenção, é **divergência silenciosa**: se a
> ingestão fragmentar diferente da consulta, a qualidade da busca cai de um jeito difícil de
> diagnosticar. O n8n orquestra em volta — gatilhos, watch de pasta, conversão de formato,
> retry e conectores externos (RF-34, RF-35) — e chama `POST /ingest` do serviço Python, que é
> a fonte única de verdade da fragmentação.

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
                    │  RAG · harness   │        └──────────────────┘
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  LLM local +     │
                    │  embeddings      │
                    └──────────────────┘
```

**Fronteira entre Node e Python:**

- **Node.js** — aplicação: autenticação, CRUD, permissões, versionamento e as **validações
  determinísticas** do checklist (RF-08 a RF-11). É o único que escreve nas tabelas de negócio.
- **Python** — IA: embeddings, recuperação, montagem de contexto, harness, chamada ao LLM, e
  as verificações do checklist que exigem julgamento.
- Regra: **o serviço de IA nunca escreve direto na base de negócio** — devolve sugestões, e o
  Node persiste após confirmação. É o que garante o RNF-01 em arquitetura.

### 10.3. Pipeline de RAG

**Ingestão:** entidade salva ou documento enviado dispara a indexação → extração →
fragmentação → enriquecimento com metadados (`projeto_id`, `nivel`, `tecnologias[]`,
`status`, `data`) → embedding → índice.

**Consulta:** query → embedding → **filtro obrigatório por metadados** → **busca híbrida**
(vetorial + full-text em português, fundidas por *Reciprocal Rank Fusion*) → top-K monta o
contexto → LLM responde apenas com base nele, citando fontes → sem contexto relevante,
responde que não encontrou.

**Isolamento por projeto exige filtro de metadados, não proximidade vetorial.** Proximidade
mede similaridade semântica, não pertencimento: o PBI "Autenticar usuário" do Projeto A e o do
Projeto B ficarão vizinhos justamente por serem parecidos — desejável no modo memória (RF-22),
desastroso no isolamento (RF-31). `projeto_id` indexado, com filtro na query.

**Estratégia de chunking.** Conteúdo estruturado (Épico, Feature, PBI, decisão) **não** é
fragmentado por tamanho fixo: cada item é um chunk, com seus campos concatenados — a unidade
semântica já existe e o guia da PRO4TECH a define. Documentos de upload: 800–1200 caracteres
com overlap de ~150, quebrando em fronteiras de parágrafo. Medir com a bateria de perguntas
antes de fixar.

### 10.4. Harness — a camada de comportamento da IA

Envolver o RAG em um **harness em formato de plugin**: a camada de ferramentação e instrução
que define *como* o modelo age — o que pode fazer, em que formato responde, o que nunca faz.

É onde o princípio da seção 3.2 vira comportamento concreto:

- Instruções que fazem o modelo **perguntar antes de redigir**
- Formato de saída fixo, aderente à estrutura do nível (7.1, 7.2, 7.3)
- **O guia da PRO4TECH como regra do sistema** — a cobertura mínima, os antipadrões e o
  checklist entram no harness, não em prompt improvisado
- Vocabulário e práticas de engenharia da PRO4TECH (Scrum, DevOps)
- Citação obrigatória de fonte e recusa sem evidência
- Ferramentas acionáveis: buscar no acervo, consultar competências, listar projetos por tecnologia

Um harness por modo de operação — levantamento · chat · recomendação de equipe — trocável sem
alterar o núcleo do RAG. É o principal diferencial técnico do projeto.

### 10.5. Modelos locais (recomendação)

| Componente | Recomendação | Por quê |
|---|---|---|
| Runtime do LLM | **Ollama** | Instalação trivial, API HTTP, multiplataforma |
| LLM | **Qwen 2.5 7B Instruct** ou **Llama 3.1 8B Instruct** | Bom em PT-BR e em seguir formato estruturado; cabem em 8–16 GB |
| Embeddings | **BAAI/bge-m3** ou **intfloat/multilingual-e5-base** | Multilíngues — modelos só-inglês degradam muito em PT-BR |
| Reranking | bge-reranker-v2-m3 *(opcional)* | Ganho de precisão se sobrar hardware |
| Transcrição *(se RF-34 entrar)* | **Whisper** local | Atende RNF-03 e RNF-04 |

⚠️ LLM local exige GPU (≥ 8 GB VRAM) ou Apple Silicon com memória unificada. Ver risco R1.

### 10.6. Versionamento dos workflows do n8n

O n8n armazena workflows no próprio banco, e o *Source Control* nativo via Git é recurso
enterprise. Sem isso, a community edition obriga a `export`/`import` manual de JSON — sem diff
legível, sem revisão e sem detecção de conflito.

A equipe resolveu construindo o **`n8n-local-sync`**, CLI GitOps publicado no PyPI sob licença
MIT (v0.1.0, 29/08/2026), que opera sobre a API REST pública do n8n.

| Comando | Função |
|---|---|
| `n8n-sync init` | Cria `.n8n-sync.yaml` e `.env.example` |
| `n8n-sync sync` *(pull)* | Traz os workflows remotos para o repositório |
| `n8n-sync push` *(import)* | Envia os workflows locais para a instância |
| `n8n-sync diff` | Diferenças estruturais local × remoto |
| `n8n-sync status` | Tabela de estado de sincronização |
| `n8n-sync validate` | Validação estrutural + varredura heurística de segredos |

Flags `--dry-run`, `--force` e `--tag`. Estados tratados: `UNCHANGED`, `REMOTE_MODIFIED`,
`LOCAL_MODIFIED`, `CONFLICT`, `REMOTE_ONLY`, `LOCAL_ONLY`.

**Por que isso importa aqui.** O ganho decisivo é o *hashing* determinístico somado à limpeza de
metadados e à normalização da ordem dos nós: sem isso, o diff de um workflow do n8n vem poluído
de ruído — posições, timestamps, ordem instável — e ninguém revisa. Com o diff normalizado,
**alteração de workflow passa a ser revisável em Pull Request** como qualquer outro código, e o
`validate` cobre parcialmente a lacuna de testabilidade apontada no risco R8.

Conflito é detectado e **pulado com aviso**, exigindo `--force`. Não há merge automático — dois
integrantes editando o mesmo workflow ainda precisam decidir manualmente, regime equivalente ao
de um arquivo binário.

**Pontos de operação:**

- **Credenciais não são versionadas.** A ferramenta sincroniza workflows; credenciais continuam
  por máquina. O `N8N_ENCRYPTION_KEY` deve ser fixado em `.env` compartilhado desde o setup —
  do contrário cada instância gera a sua e qualquer credencial importada quebra.
- **`N8N_API_KEY` nunca vai para o `.n8n-sync.yaml`** — só variável de ambiente ou `.env`,
  conforme a própria documentação da ferramenta.
- A varredura de segredos importa: o JSON do n8n guarda referência de credencial, mas nada
  impede um nó com valor fixo no parâmetro — que é exatamente o que a heurística detecta.

## 11. Modelo de dados (esboço)

| Tabela | Campos principais |
|---|---|
| `usuario` | id, nome, email, senha_hash, papel, ativo |
| `projeto` | id, nome, cliente, descricao, status, repositorio_url, data_inicio, data_fim |
| `epico` | id, projeto_id, titulo, descricao, objetivo, escopo_macro, resultado_esperado, status, prioridade |
| `feature` | id, epico_id, titulo, descricao, objetivo, status, prioridade |
| `pbi` | id, feature_id, codigo, titulo, historia_como_um, historia_eu_quero, historia_para_que, regras_observacoes, tipo, prioridade, status, versao, score_completude, criado_por, criado_em |
| `criterio_aceitacao` | id, **entidade_tipo** (epico/feature/pbi), entidade_id, ordem, texto, dado, quando, entao |
| `prototipo` | id, pbi_id, arquivo, mime, legenda, enviado_em |
| `decisao` | id, entidade_tipo, entidade_id, contexto, decisao, justificativa, alternativas, autor, data |
| `documento` | id, projeto_id, nome, mime, caminho, status_processamento, enviado_por, enviado_em |
| `tecnologia` | id, nome, categoria |
| `entidade_tecnologia` | entidade_tipo, entidade_id, tecnologia_id |
| `pbi_relacao` | pbi_origem_id, pbi_destino_id, tipo_relacao |
| `item_versao` | id, entidade_tipo, entidade_id, snapshot_json, autor, data |
| `campo_proveniencia` | entidade_tipo, entidade_id, campo, origem (humano/ia_aceita/ia_editada) |
| `checklist_resultado` | id, entidade_tipo, entidade_id, verificacao, status, detalhe, avaliado_em |
| `desenvolvedor` | id, usuario_id, senioridade, bio |
| `competencia` | id, desenvolvedor_id, tecnologia_id, nivel, evidencia |
| `alocacao` | id, desenvolvedor_id, projeto_id, epico_id, feature_id, papel, data_inicio, data_fim |
| `conversa` | id, usuario_id, escopo_tipo, escopo_id, titulo, criada_em |
| `mensagem` | id, conversa_id, papel, conteudo, fontes_json, criada_em |
| `chunk` | id, entidade_tipo, entidade_id, **projeto_id**, texto, metadados_json, embedding |

**Notas de modelagem:**

- `criterio_aceitacao` é **polimórfico**: no Épico e na Feature usa o campo `texto` (condição
  ampla / regra geral); no PBI usa `dado`, `quando`, `entao` (cenário). O guia exige critérios
  nos três níveis, com formatos diferentes.
- `pbi.historia_*` são três colunas separadas, e não um texto único — é o que permite validar
  a presença dos três blocos (RF-09) sem parsing frágil.
- `chunk.projeto_id` é desnormalizado de propósito: viabiliza o isolamento (RF-31) e o expurgo
  (RF-32) sem `JOIN` na query vetorial.

## 12. Calendário e roadmap

### 12.1. Calendário oficial — 2º Semestre 2026

| Evento | Data |
|---|---|
| Kick-off geral | 24/08 a 28/08 |
| **Construção do Backlog de Produto / Planning** | **31/08 a 04/09** |
| **Sprint 1** | **07/09 a 27/09** |
| Sprint Review / Planning | 28/09 a 02/10 |
| **Sprint 2** | **05/10 a 25/10** |
| Sprint Review / Planning | 26/10 a 30/10 |
| **Sprint 3** | **02/11 a 22/11** |
| Sprint Review | 23/11 a 27/11 |
| **🎯 Feira de Soluções** | **03/12** |
| Encerramento das aulas | 14/12 |

### 12.2. Semana de Backlog e Planning (31/08 a 04/09) — **em curso**

- Traduzir este PRD em backlog, **usando o próprio padrão da PRO4TECH** — nosso backlog vira
  a primeira validação prática do guia
- Validar o PRD com a PRO4TECH e levar as perguntas da seção 15
- Cobrar a entrega D3 (dados de projetos anteriores)
- **Spike de hardware:** validar LLM local nas máquinas do grupo (R1)
- **Spike de modelo:** comparar 2–3 LLMs e 2 modelos de embedding em PT-BR (R3)
- Subir o n8n em container, instalar o `n8n-local-sync` e validar o ciclo `pull → git diff → push` entre pelo menos duas máquinas, com `N8N_ENCRYPTION_KEY` compartilhado no `.env`
- Setup: repositório, containers, CI, ambientes

### 12.3. Sprint 1 — Fundação e estrutura de backlog (07/09 a 27/09)

**Entregável:** cadastrar `Projeto → Épico → Feature → PBI` no padrão da PRO4TECH, com as
validações estruturais funcionando e a base populada.

- Autenticação e perfis (RF-56, RF-57)
- CRUD dos quatro níveis com estrutura obrigatória (RF-01 a RF-06)
- Critérios de aceitação nos três níveis (RF-07)
- Validações determinísticas: infinitivo, história, cenários (RF-08 a RF-10)
- Registro de decisões (RF-15)
- Upload de documentos e ingestão ponta a ponta (RF-28, RF-29, RF-31)
- **Seed da base** com os dados da PRO4TECH (D3); sem eles, projetos fictícios ⚠️ R2

### 12.4. Sprint 2 — Inteligência e reúso (05/10 a 25/10)

**Entregável:** o PO especifica com apoio da IA e encontra o que já foi feito.

- Indexação automática e busca híbrida com filtros (RF-36 a RF-40)
- Primeira versão do harness, com o guia da PRO4TECH embutido (RF-27)
- Copiloto: questionador e padronizador (RF-20, RF-21)
- Sugestão de itens similares (RF-22) e de cenários (RF-23)
- Aceitar/editar/descartar e proveniência (RF-24, RF-25)
- Checklist completo e score de completude (RF-12, RF-13)
- Detecção de termos vagos (RF-11)
- Expurgo de contexto por projeto (RF-32)

### 12.5. Sprint 3 — Conversa, pessoas e fechamento (02/11 a 22/11)

**Entregável:** produto completo, apresentável na Feira.

- Chat RAG com citação de fontes e escopo selecionável (RF-41 a RF-44)
- Histórico de conversas (RF-45)
- Base de competências e alocações (RF-47 a RF-50)
- Consultas sobre a equipe e recomendação de profissionais (RF-51, RF-52)
- Versionamento e histórico (RF-16)
- Protótipos anexados a PBI (RF-30)
- Itens condicionais de E9, **se e somente se** os `Must` estiverem completos
- Polimento de UX, documentação, roteiro de demonstração

### 12.6. Reta final (23/11 a 03/12)

Sprint Review final · ensaio da apresentação · material da Feira ·
**congelamento de código em 28/11**, só correção de bug crítico depois.

## 13. Definição de pronto (DoD)

- [ ] Código revisado por outro integrante e integrado via Pull Request
- [ ] Testes automatizados dos fluxos principais passando na CI
- [ ] Funcionalidade demonstrável em ambiente executável por comando único
- [ ] Endpoints documentados (OpenAPI)
- [ ] Sem regressão nos fluxos das sprints anteriores
- [ ] Documentação do repositório atualizada
- [ ] Workflows do n8n alterados versionados e aprovados em `n8n-sync validate` na CI

## 14. Riscos

| # | Risco | Impacto | Mitigação |
|---|---|:---:|---|
| R1 | Hardware do grupo insuficiente para o LLM local | 🔴 Alto | Spike nesta semana; modelo quantizado menor; uma máquina como servidor de IA compartilhado |
| R2 | **Cold start** — a proposta é reúso, mas a base começa vazia. **D3 ainda não entregue** | 🔴 Alto | Cobrar D3 até 04/09. Plano B: seed de 5–10 projetos fictícios com temas sobrepostos, escritos no padrão do guia |
| R3 | Qualidade do modelo aberto em PT-BR abaixo do necessário | 🟠 Médio | Comparar 2–3 modelos no spike; o pipeline de recuperação pesa mais que o tamanho do modelo |
| R4 | **Escopo amplo** — 58 requisitos para 3 sprints de 3 semanas | 🔴 Alto | MoSCoW rígido; E9 é condicional; nenhum `Should` antes de todos os `Must`. Boa parte de E2 é validação determinística, barata de implementar |
| R5 | Modelo de dados mais complexo que o previsto — três estruturas distintas e critérios polimórficos | 🟠 Médio | Modelagem fechada antes da Sprint 1; o guia é preciso o bastante para não haver retrabalho de interpretação |
| R6 | Alucinação do chat destruindo a confiança na demo | 🟠 Médio | Citação obrigatória e recusa sem evidência (RF-42, RF-43); bateria de 20 perguntas por sprint |
| R7 | Dois runtimes de backend (Node + Python) gerando acoplamento confuso | 🟠 Médio | Contrato de fronteira explícito (10.2); API interna versionada; um dono por serviço |
| R8 | Dependência do `n8n-local-sync`, ferramenta própria em v0.1.0 e sem uso em produção | 🟡 Baixo | Código nosso, MIT e pequeno — bug é corrigível internamente. Cobrir com `n8n-sync validate` na CI e testar o ciclo completo no setup, antes da Sprint 1 |
| R9 | LGPD nos dados de competências | 🟡 Baixo | Apenas dados profissionais, com consentimento; acesso restrito |

## 15. Perguntas abertas para o cliente

| # | Pergunta | Por que importa |
|---|---|---|
| Q1 | O PO usa a plataforma como **ferramenta principal de especificação** (e depois leva ao Azure DevOps), ou é um **repositório consultivo** alimentado depois? | Muda o peso entre o CRUD e o chat |
| Q2 | Estimativa de esforço com base no histórico está no escopo? O guia trata estimativa por nível, o que sugere que sim | Define a inclusão de E9 (RF-55) |
| Q3 | Faz sentido ingerir transcrições de reuniões PO↔cliente como contexto? | Alto valor; amplia escopo e levanta privacidade (RF-34) |
| Q4 | **Existe um nível "Projeto" acima do Épico?** O guia começa em Épico; o kickoff pedia "Criar Projeto" | É a raiz da hierarquia e a chave do isolamento de contexto (RF-31) |
| Q5 | Os PBIs recebem código/identificador em algum padrão de nomenclatura da casa? | Define o formato de `pbi.codigo` |
| Q6 | Há integração desejada com o Azure DevOps, mesmo que só de leitura? | Fonte de dados rica, hoje fora do escopo |
| Q7 | Quantos usuários simultâneos e qual volume de projetos? | Dimensiona a infraestrutura de IA local |

> **Q4 da versão 1.0** — "qual a estrutura documental de épico, feature e backlog?" — foi
> **respondida** pela entrega do guia em 25/08.

## 16. Dependências do cliente

| # | Entrega | Status | Impacto |
|---|---|---|---|
| D1 | Apresentação institucional | ✅ **Recebida** (25/08) | — |
| D2 | Modelos de estruturação: epic, feature e backlog | ✅ **Recebida** (25/08) — *Guia de Especificação de Itens de Trabalho* | Aplicada nesta revisão 1.1 |
| D3 | Dados de projetos anteriores para a base inicial | ⏳ **Pendente** | 🔴 Alto — sem isso o cold start (R2) permanece |

> O guia recebido é declaradamente **genérico, com exemplos fictícios**. Ele resolve a D2, mas
> **não substitui a D3**: continuamos sem conteúdo real para popular a base de conhecimento.

## 17. Pendências internas

| # | Pendência | Responsável |
|---|---|---|
| P1 | Registrar integrantes do grupo, papéis, Scrum Master e PO | Time |
| P2 | Critérios de avaliação da disciplina | Time |
| P3 | Definir o nome definitivo do produto | Time |
| ~~P4~~ | ~~Confirmar o nome do contato da PRO4TECH~~ — ✅ **resolvida em 02/09**: o contato do cliente é **Rafael Monteiro**. *Rafael Matesco* é integrante do time de desenvolvimento do grupo e foi quem redigiu as anotações do kick-off | — |
| P5 | Validar este PRD com o cliente e levar as perguntas da seção 15 | PO do grupo |
| P6 | Definir a estratégia final de chunking com base em teste medido | Time de IA |
| ~~P7~~ | ~~Decidir sobre o n8n~~ — ✅ **resolvida em 02/09**: mantido, com a fronteira de ingestão fixada na seção 10.1 e versionamento via `n8n-local-sync` | — |
| P8 | Escrever o backlog do próprio projeto no padrão do guia — valida o entendimento antes de codificar | Time |
