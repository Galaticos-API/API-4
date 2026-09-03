# EP-04 — Consultar o conhecimento em linguagem natural

**Sprint:** 3 · **7 PBIs** · [← voltar ao índice](README.md)

## Descrição

Permitir que qualquer pessoa da fábrica pergunte, em linguagem natural, sobre o que foi
especificado em qualquer projeto, e receba resposta fundamentada exclusivamente no acervo, com
indicação das fontes. Atende tanto à consulta pontual de quem já conhece o contexto quanto à
contextualização de quem acabou de entrar em um projeto.

## Objetivo

Eliminar o custo de recuperar conhecimento antigo. Hoje descobrir como funciona o login de um
projeto de dois anos atrás significa encontrar quem trabalhou nele — e essa pessoa pode não
estar mais na empresa.

## Escopo macro

- Conversa em linguagem natural sobre o acervo
- Citação obrigatória das fontes de cada resposta
- Recusa explícita quando não houver evidência na base
- Seleção do escopo da consulta
- Histórico e retomada de conversas

## Resultado esperado

Um novo integrante consegue responder perguntas sobre um projeto que nunca viu, usando apenas
a plataforma, e consegue verificar cada afirmação abrindo o item de origem citado.

## Critérios de aceitação

- **Toda resposta deve citar as fontes que a fundamentam**, com acesso ao item de origem.
- O sistema deve declarar a ausência de informação quando o acervo não a contiver, em vez de
  produzir resposta não fundamentada.
- Consultas restritas a um escopo não devem retornar conteúdo de fora daquele escopo.
- A primeira resposta deve ser apresentada em menos de cinco segundos.
- A indisponibilidade do serviço de inteligência artificial não deve afetar as demais
  funcionalidades da plataforma.

---

## FT-04.1 — Chat sobre o acervo

**Sprint 3** · 4 PBIs

**Descrição.** A interface de conversa e as garantias que a tornam confiável: fundamentação,
citação e recusa.

**Objetivo.** Dar acesso ao conhecimento acumulado sem exigir que a pessoa saiba onde procurar
nem qual vocabulário foi usado por quem escreveu.

**Critérios de aceitação**

- A resposta deve ser construída exclusivamente a partir do conteúdo recuperado do acervo.
- As fontes citadas devem corresponder ao conteúdo efetivamente utilizado na resposta.
- O escopo selecionado deve permanecer visível durante toda a conversa.

### PBI-04.1.1 — Conversar com o acervo · `Must`

COMO UM membro da equipe
EU QUERO perguntar em linguagem natural sobre os projetos
PARA QUE eu obtenha informação sem precisar navegar a estrutura inteira.

**Cenário 1 — Responder pergunta sobre funcionalidade**
DADO que exista no acervo a especificação de autenticação do Projeto A
QUANDO eu perguntar "como funciona o login do Projeto A?"
ENTÃO o sistema deve responder com base no conteúdo especificado daquele projeto.

**Cenário 2 — Responder pergunta transversal a projetos**
DADO que existam projetos com integração ao WhatsApp
QUANDO eu perguntar "quais projetos têm integração com WhatsApp?"
ENTÃO o sistema deve listar os projetos correspondentes.

**Cenário 3 — Tratar indisponibilidade**
DADO que o serviço de inteligência artificial esteja indisponível
QUANDO eu enviar uma pergunta
ENTÃO o sistema deve informar a indisponibilidade e preservar a pergunta digitada.

**Cenário 4 — Restringir ao acesso do usuário**
DADO que eu não tenha acesso a determinado projeto
QUANDO eu fizer uma pergunta cuja resposta dependa dele
ENTÃO o conteúdo desse projeto não deve ser utilizado na resposta.

### PBI-04.1.2 — Citar as fontes da resposta · `Must`

COMO UM membro da equipe
EU QUERO ver de onde veio cada informação da resposta
PARA QUE eu possa verificar e aprofundar a leitura.

**Cenário 1 — Apresentar as fontes**
DADO que o sistema tenha respondido a uma pergunta
QUANDO eu visualizar a resposta
ENTÃO ela deve apresentar as fontes utilizadas, identificando projeto e item de origem.

**Cenário 2 — Navegar até a fonte**
DADO que uma resposta cite fontes
QUANDO eu selecionar uma delas
ENTÃO o sistema deve abrir o item de trabalho ou documento correspondente.

**Cenário 3 — Refletir o conteúdo utilizado**
DADO que a resposta tenha sido construída a partir de três itens
QUANDO as fontes forem apresentadas
ENTÃO devem constar exatamente os itens utilizados, sem incluir conteúdo não aproveitado.

### PBI-04.1.3 — Recusar resposta sem evidência · `Must`

COMO UM membro da equipe
EU QUERO que o sistema admita quando não sabe
PARA QUE eu não tome decisão com base em informação inventada.

**Cenário 1 — Declarar ausência de informação**
DADO que o acervo não contenha informação sobre o assunto perguntado
QUANDO eu enviar a pergunta
ENTÃO o sistema deve informar que não encontrou a informação na base, sem produzir resposta
especulativa.

**Cenário 2 — Sinalizar resposta parcial**
DADO que o acervo contenha apenas parte da informação necessária
QUANDO a resposta for apresentada
ENTÃO o sistema deve responder com o que existe e explicitar o que não foi encontrado.

**Cenário 3 — Não responder fora do acervo**
DADO que eu pergunte sobre assunto sem relação com os projetos cadastrados
QUANDO eu enviar a pergunta
ENTÃO o sistema deve informar que sua base de conhecimento se restringe ao acervo da fábrica.

**Regras e observações.** Este é o PBI que sustenta a confiança na plataforma. Deve ser
verificado a cada sprint pela bateria de perguntas de regressão (habilitador HT-10).

### PBI-04.1.4 — Selecionar o escopo da conversa · `Must`

COMO UM membro da equipe
EU QUERO restringir a conversa a um contexto específico
PARA QUE as respostas não misturem informação de projetos diferentes.

**Cenário 1 — Restringir a um projeto**
DADO que eu selecione um projeto como escopo
QUANDO eu fizer perguntas
ENTÃO as respostas devem se basear somente no conteúdo daquele projeto.

**Cenário 2 — Consultar toda a base**
DADO que eu selecione o escopo de toda a base
QUANDO eu fizer uma pergunta comparativa entre projetos
ENTÃO o sistema deve considerar o acervo completo.

**Cenário 3 — Exibir o escopo ativo**
DADO que exista um escopo selecionado
QUANDO eu estiver conversando
ENTÃO o escopo deve permanecer visível na interface.

**Cenário 4 — Informar limitação do escopo**
DADO que o escopo esteja restrito a um projeto
QUANDO a resposta existir apenas em outro projeto
ENTÃO o sistema deve informar que não encontrou no escopo atual e oferecer ampliar a busca.

---

## FT-04.2 — Continuidade das conversas

**Sprint 3** · 3 PBIs

**Descrição.** Persistência, recuperação e acompanhamento das conversas realizadas.

**Objetivo.** Permitir que uma consulta seja retomada depois, e que o raciocínio construído em
uma conversa não se perca ao fechar a tela.

**Critérios de aceitação**

- Conversas devem ser privadas ao usuário que as realizou.
- A retomada de uma conversa deve preservar o escopo originalmente selecionado.
- Conversas devem ser identificáveis sem exigir que o usuário as nomeie manualmente.

### PBI-04.2.1 — Consultar o histórico de conversas · `Should`

COMO UM membro da equipe
EU QUERO consultar minhas conversas anteriores
PARA QUE eu recupere o que já perguntei sem refazer o caminho.

**Cenário 1 — Listar conversas**
DADO que eu tenha realizado conversas anteriormente
QUANDO eu abrir o histórico
ENTÃO o sistema deve listá-las da mais recente para a mais antiga, com título e escopo.

**Cenário 2 — Nomear automaticamente**
DADO que eu inicie uma conversa
QUANDO a primeira pergunta for enviada
ENTÃO o sistema deve atribuir um título derivado do assunto tratado.

**Cenário 3 — Restringir ao próprio usuário**
DADO que outro usuário tenha conversas registradas
QUANDO eu abrir meu histórico
ENTÃO as conversas dele não devem aparecer.

### PBI-04.2.2 — Retomar uma conversa · `Should`

COMO UM membro da equipe
EU QUERO retomar uma conversa anterior
PARA QUE eu continue a partir do contexto já estabelecido.

**Cenário 1 — Reabrir conversa**
DADO que eu selecione uma conversa do histórico
QUANDO ela for aberta
ENTÃO o sistema deve apresentar todas as mensagens trocadas, com as fontes citadas
preservadas.

**Cenário 2 — Preservar o escopo**
DADO que a conversa tenha sido realizada com escopo restrito a um projeto
QUANDO eu retomá-la
ENTÃO o mesmo escopo deve ser restabelecido.

### PBI-04.2.3 — Acompanhar a resposta em streaming · `Could`

COMO UM membro da equipe
EU QUERO ver a resposta sendo construída
PARA QUE eu perceba que o sistema está processando e comece a ler antes do término.

**Cenário 1 — Exibir progressivamente**
DADO que eu tenha enviado uma pergunta
QUANDO a resposta começar a ser gerada
ENTÃO o sistema deve apresentá-la progressivamente, sem aguardar a conclusão.

**Cenário 2 — Citar fontes ao final**
DADO que a resposta esteja sendo apresentada progressivamente
QUANDO a geração for concluída
ENTÃO as fontes devem ser apresentadas junto da resposta completa.

**Cenário 3 — Interromper a geração**
DADO que uma resposta esteja sendo gerada
QUANDO eu solicitar a interrupção
ENTÃO o sistema deve interromper e preservar o conteúdo já apresentado.
