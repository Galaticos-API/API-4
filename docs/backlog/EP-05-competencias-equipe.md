# EP-05 — Mapear as competências da equipe

**Sprint:** 3 · **7 PBIs** · [← voltar ao índice](README.md)

## Descrição

Manter, ao lado do conhecimento sobre os projetos, o conhecimento sobre quem os construiu:
competências técnicas, experiência acumulada e histórico de atuação de cada profissional da
fábrica. Serve à formação de squads e à identificação de quem consultar diante de um problema
já enfrentado antes.

## Objetivo

Responder onde o conhecimento está dentro da equipe. Saber que a fábrica já integrou pagamentos
via PIX tem valor; saber quem fez essa integração, e portanto quem consultar, tem valor maior.

## Escopo macro

- Perfil profissional dos desenvolvedores
- Registro de competências técnicas com nível e evidência
- Registro de alocação em projetos, com papel e período
- Consulta sobre a experiência da equipe
- Recomendação de profissionais para uma nova demanda

## Resultado esperado

Ao iniciar uma nova iniciativa, o gestor consegue identificar quem na equipe já resolveu
problema semelhante, com base em histórico registrado e não em memória pessoal.

## Critérios de aceitação

- O registro deve se restringir a informações de natureza profissional.
- Toda competência afirmada deve poder ser acompanhada de evidência que a sustente.
- Recomendações devem apresentar a justificativa que as fundamenta, permitindo que o gestor
  avalie o critério.
- O acesso aos perfis deve respeitar os perfis de acesso da plataforma.

---

## FT-05.1 — Perfil profissional

**Sprint 3** · 4 PBIs

**Descrição.** Cadastro e manutenção dos dados profissionais dos desenvolvedores: perfil,
competências técnicas e alocações em projetos.

**Objetivo.** Constituir a base factual sobre a equipe, a partir da qual as consultas e
recomendações se tornam possíveis.

**Critérios de aceitação**

- Competências devem ser registradas sobre o vocabulário controlado de tecnologias, evitando
  variações de escrita para a mesma tecnologia.
- Uma alocação deve indicar papel e período, e vincular-se a um projeto existente.
- Dados pessoais não relacionados à atuação profissional não devem ser registrados.

### PBI-05.1.1 — Cadastrar desenvolvedor · `Must`

COMO UM gestor
EU QUERO cadastrar o perfil profissional de um desenvolvedor
PARA QUE ele possa ser associado a competências e projetos.

**Cenário 1 — Criar perfil**
DADO que eu esteja na administração de pessoas
QUANDO eu informar nome, senioridade e um resumo profissional e confirmar
ENTÃO o sistema deve criar o perfil do desenvolvedor.

**Cenário 2 — Vincular a um usuário da plataforma**
DADO que o desenvolvedor possua acesso à plataforma
QUANDO eu vincular o perfil ao seu usuário
ENTÃO o sistema deve associar os dois registros.

**Cenário 3 — Impedir duplicidade**
DADO que já exista perfil para o mesmo usuário
QUANDO eu tentar criar outro
ENTÃO o sistema deve impedir e indicar o perfil existente.

### PBI-05.1.2 — Registrar competência técnica · `Must`

COMO UM gestor
EU QUERO registrar as competências técnicas de um desenvolvedor
PARA QUE seja possível localizar quem domina cada tecnologia.

**Cenário 1 — Registrar competência com nível**
DADO que eu esteja editando um perfil
QUANDO eu selecionar uma tecnologia do vocabulário e informar o nível
ENTÃO o sistema deve registrar a competência no perfil.

**Cenário 2 — Registrar evidência**
DADO que eu esteja registrando uma competência
QUANDO eu informar a evidência que a sustenta
ENTÃO o sistema deve preservá-la junto da competência.

**Cenário 3 — Impedir tecnologia fora do vocabulário**
DADO que eu informe uma tecnologia inexistente no vocabulário
QUANDO eu tentar registrar a competência
ENTÃO o sistema deve impedir e oferecer a inclusão da tecnologia no vocabulário.

### PBI-05.1.3 — Registrar alocação em projeto · `Must`

COMO UM gestor
EU QUERO registrar em quais projetos cada desenvolvedor atuou
PARA QUE a experiência prática fique documentada.

**Cenário 1 — Registrar alocação**
DADO que eu esteja editando um perfil
QUANDO eu informar projeto, papel e período e confirmar
ENTÃO o sistema deve registrar a alocação.

**Cenário 2 — Registrar alocação em curso**
DADO que a alocação esteja ativa
QUANDO eu não informar a data de término
ENTÃO o sistema deve registrar a alocação como em andamento.

**Cenário 3 — Validar o período**
DADO que a data de término seja anterior à de início
QUANDO eu tentar confirmar
ENTÃO o sistema deve impedir e indicar a inconsistência.

### PBI-05.1.4 — Consultar o perfil de um desenvolvedor · `Should`

COMO UM membro da equipe
EU QUERO consultar o perfil de um colega
PARA QUE eu saiba com quem falar sobre determinado assunto.

**Cenário 1 — Exibir perfil consolidado**
DADO que eu abra o perfil de um desenvolvedor
QUANDO a tela for apresentada
ENTÃO devem constar suas competências, alocações e o histórico consolidado de atuação.

**Cenário 2 — Navegar para os projetos**
DADO que o perfil apresente alocações
QUANDO eu selecionar um projeto
ENTÃO o sistema deve abrir aquele projeto.

---

## FT-05.2 — Conhecimento sobre a equipe

**Sprint 3** · 3 PBIs

**Descrição.** Consultas e recomendações construídas a partir do cruzamento entre pessoas,
projetos e tecnologias.

**Objetivo.** Converter o registro em decisão: apoiar a escolha de quem consultar e de quem
alocar em uma nova demanda.

**Critérios de aceitação**

- Consultas sobre pessoas devem apresentar a evidência que sustenta cada resultado.
- Recomendações devem explicitar o critério utilizado, e nunca ser apresentadas como decisão
  automática.
- Consultas sobre a equipe devem estar disponíveis também pela interface de conversa.

### PBI-05.2.1 — Consultar quem já trabalhou com uma tecnologia · `Must`

COMO UM gestor
EU QUERO descobrir quem na equipe já trabalhou com determinada tecnologia
PARA QUE eu saiba a quem recorrer.

**Cenário 1 — Responder pela conversa**
DADO que existam desenvolvedores com experiência registrada em integração PIX
QUANDO eu perguntar "quem já trabalhou com integração PIX?"
ENTÃO o sistema deve listar os profissionais e os projetos que fundamentam a resposta.

**Cenário 2 — Tratar ausência de correspondência**
DADO que ninguém possua experiência registrada na tecnologia consultada
QUANDO eu fizer a pergunta
ENTÃO o sistema deve informar a ausência de registro, sem sugerir profissionais sem
fundamento.

### PBI-05.2.2 — Recomendar profissionais para uma feature · `Should`

COMO UM gestor
EU QUERO receber sugestão de quem tem mais afinidade com uma nova demanda
PARA QUE a formação do squad considere experiência real e não apenas disponibilidade.

**Cenário 1 — Recomendar com justificativa**
DADO que uma feature possua tecnologias associadas
QUANDO eu solicitar recomendação de profissionais
ENTÃO o sistema deve apresentar os profissionais com maior aderência e a justificativa de cada
indicação.

**Cenário 2 — Sinalizar base insuficiente**
DADO que a feature não possua tecnologias associadas
QUANDO eu solicitar recomendação
ENTÃO o sistema deve informar que não há base suficiente para recomendar.

**Cenário 3 — Manter caráter consultivo**
DADO que uma recomendação seja apresentada
QUANDO eu visualizá-la
ENTÃO ela deve constar como sugestão, sem qualquer alocação automática.

### PBI-05.2.3 — Consolidar o histórico de atuação · `Should`

COMO UM gestor
EU QUERO que o histórico de atuação seja consolidado automaticamente
PARA QUE o perfil reflita a experiência real sem depender de atualização manual.

**Cenário 1 — Derivar das alocações**
DADO que um desenvolvedor esteja alocado em projetos
QUANDO eu consultar seu perfil
ENTÃO o histórico deve apresentar as tecnologias e os contextos dos projetos em que atuou.

**Cenário 2 — Atualizar ao registrar nova alocação**
DADO que eu registre uma nova alocação
QUANDO ela for salva
ENTÃO o histórico consolidado deve refletir a inclusão.
