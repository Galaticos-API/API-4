# Planejamento Scrum — Sinapse

> Documento central de execução do projeto API do 4º semestre de ADS da Fatec São José dos Campos.

| Informação | Definição |
|---|---|
| Produto | Sinapse — Base Inteligente de Requisitos |
| Cliente | PRO4TECH |
| Scrum Master | Cauan Gabriel |
| Equipe | 7 integrantes do Dev Team + Product Owner + Scrum Master |
| Backlog | 6 épicos, 18 features e 63 User Stories/PBIs |
| Execução | 67 tarefas técnicas distribuídas em 3 sprints |
| Quadro | [Sinapse — Scrum — 2026/2](https://trello.com/b/CY2QHrh1/sinapse-scrum-2026-2) |

## 1. Objetivo

Este documento é o ponto de entrada para o planejamento e a execução do projeto. Ele conecta o backlog de produto, as User Stories, as tarefas técnicas e o quadro Scrum sem substituir os critérios de aceitação originais.

Cada tarefa deve:

1. estar vinculada a uma ou mais User Stories por meio do código `PBI-XX.X.X`;
2. permanecer na sprint definida no plano até que uma decisão formal de planejamento determine o contrário;
3. ter exatamente uma prioridade e pelo menos uma área técnica;
4. ser atribuída a uma pessoa somente durante o Sprint Planning;
5. atender aos cenários `DADO/QUANDO/ENTÃO` dos PBIs vinculados.

## 2. Documentos de referência

| Documento | Finalidade |
|---|---|
| [Índice do backlog](backlog/README.md) | Navegação pelos épicos, features e PBIs |
| [Plano detalhado das tarefas](planning/PLANO_DE_TAREFAS_DESENVOLVIMENTO.md) | Escopo, dependências, tamanho, prioridade e rastreabilidade das 67 tarefas |
| [Automação do Trello](planning/TRELLO_AUTOMACAO.md) | Instruções para sincronizar e manter o quadro |
| [README principal](../README.md#-user-stories-e-rastreabilidade-das-tarefas) | Matriz resumida de tarefas por User Story |

## 3. Organização das sprints

| Sprint | Período | Tarefas | Meta |
|:---:|:---:|:---:|---|
| 1 | 07/09/2026 a 27/09/2026 | 32 | Entregar hierarquia PRO4TECH, autenticação, validações determinísticas, decisões e anexos sem dependência de IA. |
| 2 | 05/10/2026 a 25/10/2026 | 18 | Formar o acervo pesquisável e introduzir a IA como apoio, sempre com confirmação humana. |
| 3 | 02/11/2026 a 22/11/2026 | 17 | Entregar chat fundamentado, perfis profissionais, administração e o release final. |
| **Total** | — | **67** | Cobrir integralmente as 63 User Stories do backlog. |

## 4. Fluxo do quadro

```text
Backlog da Sprint
        ↓
Em andamento
        ↓
Revisão de código
        ↓
Teste e Validação
        ↓
Concluído
```

As listas `Visão e Regras` e `Decisões e Impedimentos` concentram governança, metas, dúvidas do cliente e bloqueios externos.

### Limites de trabalho em andamento

| Etapa | Limite |
|---|:---:|
| Em andamento | 7 cartões |
| Revisão de código | 4 cartões |
| Teste e Validação | 4 cartões |

O limite de sete tarefas em andamento representa um foco principal por integrante do Dev Team. Finalizar ou encaminhar o trabalho atual tem precedência sobre iniciar uma nova tarefa.

## 5. Padrão dos cartões

### Título

```text
[ID] Resultado técnico esperado
```

Exemplo:

```text
[S2-06] Implementar busca híbrida PT-BR
```

### Descrição

Todo cartão técnico contém, nesta ordem:

1. **Resumo** — explicação curta do que será entregue;
2. **Detalhamento** — comportamento e resultado esperado;
3. **Referência do backlog** — links diretos para os PBIs relacionados;
4. **Resultado esperado** — condição observável da entrega;
5. **Dependências** — cartões que precisam estar concluídos ou encaminhados;
6. **Tamanho estimado** — `P`, `M` ou `G`;
7. **Áreas envolvidas** — componentes técnicos afetados;
8. **Como validar a conclusão** — checklist da Definição de Pronto.

## 6. Etiquetas

### Sprint

- `🗓️ Sprint 1`
- `🗓️ Sprint 2`
- `🗓️ Sprint 3`

### Prioridade

- `🚨 Bloqueante` — impede o avanço de outras entregas;
- `🔴 Obrigatória (Must)` — indispensável para o incremento;
- `🟡 Importante (Should)` — importante, mas negociável diante de risco;
- `🟢 Opcional (Could)` — executada apenas se houver capacidade.

### Área técnica

As etiquetas começam com `Área:` e identificam competências necessárias, como Backend, Frontend, Banco de Dados, IA e RAG, Segurança, Qualidade e Testes, UX/UI, DevOps e Documentação. Elas não representam responsáveis.

### Governança

As etiquetas `Tipo: Governança` e `Papel:` identificam cartões de processo e responsabilidades de Scrum Master, Product Owner e Dev Team.

## 7. Papéis e responsabilidades

### Product Owner

- ordenar o backlog por valor;
- esclarecer regras e cenários dos PBIs;
- confirmar decisões pendentes com a PRO4TECH;
- aceitar ou rejeitar resultados demonstrados.

### Scrum Master

- facilitar eventos Scrum;
- acompanhar riscos, bloqueios e limites de WIP;
- proteger a rastreabilidade entre User Stories e tarefas;
- apoiar o time sem distribuir trabalho unilateralmente.

### Dev Team

- estimar e selecionar trabalho conforme a capacidade;
- implementar, testar, documentar e revisar em conjunto;
- manter um responsável principal por cartão;
- registrar dependências e impedimentos assim que forem identificados.

## 8. Definição de Pronto

Uma tarefa só pode ir para `Concluído` quando:

- o resultado pode ser demonstrado contra todos os PBIs vinculados;
- os cenários de aceitação relevantes estão atendidos;
- testes automatizados passam na integração contínua;
- regras de autorização e isolamento possuem testes de negação quando aplicáveis;
- o Pull Request foi revisado por outra pessoa;
- endpoints alterados estão documentados em OpenAPI;
- workflows alterados passam no `n8n-sync validate`;
- logs não expõem tokens, senhas, documentos completos ou outros dados sensíveis;
- a documentação foi atualizada quando necessário.

## 9. Política de rastreabilidade

A rastreabilidade oficial segue este caminho:

```text
Épico → Feature → User Story/PBI → Tarefa técnica → Pull Request
```

- O código do PBI identifica o épico e a feature de origem.
- Toda tarefa técnica referencia pelo menos um PBI existente.
- Uma tarefa pode atender a vários PBIs quando a implementação é transversal.
- Um PBI pode exigir mais de uma tarefa quando houver separação por interface, backend, dados, IA ou validação.
- Habilitadores `PRE-*`, tarefas de integração e release também possuem PBIs concretos relacionados.
- O Pull Request deve citar o ID da tarefa e os PBIs atendidos.

## 10. Segurança das credenciais do Trello

A automação lê `TRELLO_API_KEY` e `TRELLO_TOKEN` exclusivamente do ambiente local. Credenciais não devem ser adicionadas ao código, à documentação, aos commits ou ao histórico do Git.
