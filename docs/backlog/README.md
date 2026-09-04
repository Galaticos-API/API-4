# Backlog de Produto — Sinapse

**Cliente:** PRO4TECH · **Grupo Galáticos** — Fatec São José dos Campos
**Padrão:** [Guia de Especificação de Itens de Trabalho](../Guia_Especificacao_Itens_de_Trabalho_FATEC.pdf) (PRO4TECH, 25/08/2026)
**Base:** [PRD.md](../PRD.md) v1.1
**Versão:** 1.0 — 02/09/2026 · **Time:** 9 pessoas

---

## Como este backlog é organizado

Segue a hierarquia do guia do cliente: **Épico → Feature → PBI**.

| Nível | Pergunta | Critérios de aceitação |
|---|---|---|
| **Épico** | Que resultado amplo queremos alcançar? | Condições amplas e verificáveis |
| **Feature** | Que capacidade o produto precisa oferecer? | Regras gerais da capacidade |
| **PBI** | Que comportamento específico será implementado? | Cenários `DADO / QUANDO / ENTÃO` |

Todo PBI tem título iniciado por **verbo no infinitivo** e história no formato
`COMO UM / EU QUERO / PARA QUE`, conforme a regra obrigatória do guia.

### Convenção de códigos

`EP-01` → `FT-01.1` → `PBI-01.1.1`

O código carrega a rastreabilidade exigida pelo guia: lendo `PBI-01.3.2` sabe-se que ele
pertence à Feature `FT-01.3`, que realiza parte do Épico `EP-01`.

> ⚠️ **Convenção provisória.** Aguarda resposta da questão **Q5** do PRD — se a PRO4TECH usa um
> padrão próprio de identificação, adotamos o deles.

---

## Épicos

| Código | Épico | Sprints | PBIs |
|---|---|:---:|:---:|
| [EP-01](EP-01-especificar-backlog.md) | Especificar o backlog de produto no padrão da fábrica | 1, 2, 3 | 24 |
| [EP-02](EP-02-preservar-conhecimento.md) | Preservar o conhecimento dos projetos | 1, 2 | 11 |
| [EP-03](EP-03-apoio-inteligencia-artificial.md) | Especificar com apoio da inteligência artificial | 2 | 9 |
| [EP-04](EP-04-consultar-conhecimento.md) | Consultar o conhecimento em linguagem natural | 3 | 7 |
| [EP-05](EP-05-competencias-equipe.md) | Mapear as competências da equipe | 3 | 7 |
| [EP-06](EP-06-acesso-controlado.md) | Operar a plataforma com acesso controlado | 1, 3 | 5 |
| | **Total** | | **63** |

---

## Mapa de sprints

### Sprint 1 — 07/09 a 27/09 · **28 PBIs**
> **Foco: interface, experiência e conformidade com o padrão.**
> Entrega uma plataforma onde o PO cadastra o backlog completo no padrão da PRO4TECH e recebe
> crítica automática da qualidade da especificação — **sem nenhuma IA envolvida**.

| Feature | PBIs |
|---|:---:|
| FT-06.1 Acesso à plataforma | 3 |
| FT-01.1 Estruturação dos itens de trabalho | 6 |
| FT-01.2 Critérios de aceitação por nível | 4 |
| FT-01.3 Conformidade com o guia de especificação | 6 |
| FT-01.4 Navegação do backlog | 3 |
| FT-01.5 Rastreabilidade das decisões *(parcial)* | 2 |
| FT-02.1 Anexos e protótipos | 4 |

**Por que esta ordem.** As validações de conformidade (FT-01.3) são determinísticas — regex de
verbo no infinitivo, parsing da história e dos cenários, lista de termos vagos. São baratas de
implementar e entregam a percepção de "o sistema entende meu trabalho" já na primeira review,
que é exatamente onde o cliente consegue opinar melhor.

### Sprint 2 — 05/10 a 25/10 · **18 PBIs**
> **Foco: o acervo passa a existir e a IA entra como copiloto.**

| Feature | PBIs |
|---|:---:|
| FT-02.2 Indexação do acervo | 4 |
| FT-02.3 Busca no acervo | 3 |
| FT-03.1 Copiloto de especificação | 4 |
| FT-03.2 Controle das sugestões | 3 |
| FT-03.3 Governança do comportamento da IA | 2 |
| FT-01.5 Rastreabilidade *(restante)* | 2 |

### Sprint 3 — 02/11 a 22/11 · **17 PBIs**
> **Foco: conversa com o acervo, conhecimento sobre a equipe e fechamento.**

| Feature | PBIs |
|---|:---:|
| FT-04.1 Chat sobre o acervo | 4 |
| FT-04.2 Continuidade das conversas | 3 |
| FT-05.1 Perfil profissional | 4 |
| FT-05.2 Conhecimento sobre a equipe | 3 |
| FT-06.2 Administração | 2 |
| FT-01.5 Exportação | 1 |

---

## Habilitadores técnicos

Trabalho técnico necessário que **não pertence ao backlog de produto**. O guia admite tarefas
técnicas abaixo do PBI, mas é explícito que elas não substituem a descrição funcional — e
infraestrutura não descreve comportamento de usuário. Ficam registrados aqui para
planejamento, fora da hierarquia.

| # | Habilitador | Quando | Bloqueia | Status |
|:---:|---|---|---|:---:|
| HT-01 | Repositório, containers, ambientes e pipeline de CI | Pré-Sprint 1 | Tudo | [x] Concluído |
| HT-02 | Modelagem e migrations do banco relacional | Pré-Sprint 1 | FT-01.1 | [ ] Pendente |
| HT-03 | Design system e biblioteca de componentes | Pré-Sprint 1 | Todo o front | [ ] Pendente |
| HT-04 | Protótipo navegável das telas da Sprint 1 | Pré-Sprint 1 | FT-01.1, FT-01.4 | [ ] Pendente |
| HT-05 | Spike: validar LLM local nas máquinas do time | Pré-Sprint 1 | FT-03.\* | [x] Concluído |
| HT-06 | Spike: comparar modelos de embedding em PT-BR | Pré-Sprint 1 | FT-02.2 | [ ] Pendente |
| HT-07 | n8n em container + `n8n-local-sync` + `N8N_ENCRYPTION_KEY` compartilhado | Pré-Sprint 1 | FT-02.2 | [x] Concluído |
| HT-08 | Serviço Python de IA: esqueleto e contrato com o Node | Sprint 1 | FT-02.2, FT-03.\* | [x] Concluído |
| HT-09 | Carga inicial da base de conhecimento *(seed)* | Sprint 1 | FT-02.3, FT-03.1 | [ ] Pendente |
| HT-10 | Bateria de 20 perguntas de regressão para busca e chat | Sprint 2 | FT-02.3, FT-04.1 | [ ] Pendente |

> ⚠️ **HT-09 é crítico.** A proposta de valor é reúso, e a base nasce vazia. Depende da entrega
> **D3** (dados de projetos anteriores) pela PRO4TECH, ainda pendente. Sem ela, o seed precisa
> ser construído com projetos fictícios escritos no padrão do guia — trabalho que precisa entrar
> no planejamento da Sprint 1, não ser descoberto na véspera da review.

---

## Priorização

Todo PBI carrega prioridade **MoSCoW**. A regra do time: **nenhum `Should` começa antes de
todos os `Must` da sprint estarem fechados**. São 63 PBIs para 3 sprints de 3 semanas — a
disciplina de priorização é o que separa entregar de quase entregar.

| Prioridade | Significado |
|---|---|
| **Must** | Sem isso a sprint não é entregável |
| **Should** | Importante, mas a sprint sobrevive sem |
| **Could** | Entra se sobrar folga |

---

## Definição de pronto

Herdada do [PRD](../PRD.md), seção 13. Um PBI só é dado como concluído com:

- [ ] Todos os cenários de aceitação demonstráveis
- [ ] Código revisado por outro integrante e integrado via Pull Request
- [ ] Testes automatizados dos cenários principais passando na CI
- [ ] Sem regressão nos PBIs das sprints anteriores
- [ ] Endpoints documentados em OpenAPI, quando aplicável
- [ ] Workflows do n8n alterados versionados e aprovados em `n8n-sync validate`

---

## Pendências que afetam este backlog

| # | Pendência | Impacto se mudar |
|---|---|---|
| Q4 | Existe um nível "Projeto" acima do Épico? | Altera `PBI-01.1.1` e a raiz de toda a hierarquia |
| Q5 | Padrão de identificação de itens da PRO4TECH | Altera a convenção de códigos deste documento |
| Q1 | A plataforma é ferramenta principal de especificação ou repositório consultivo? | Reequilibra o peso entre EP-01 e EP-04 |
| D3 | Dados de projetos anteriores | Define se HT-09 é carga ou construção do zero |
