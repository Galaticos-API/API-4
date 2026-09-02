# EP-03 — Especificar com apoio da inteligência artificial

**Sprint:** 2 · **9 PBIs** · [← voltar ao índice](README.md)

## Descrição

Colocar a inteligência artificial ao lado do Product Owner durante o levantamento de
requisitos, atuando como interlocutor que questiona lacunas, propõe padronização e recupera
trabalho semelhante já realizado. A IA opera sobre o acervo construído em `EP-02` e é regida
pelo padrão de especificação da PRO4TECH.

## Objetivo

Elevar a qualidade da especificação sem transferir a autoria para a máquina. O valor não está
em escrever mais rápido, mas em o Product Owner perceber, no momento da escrita, o que ele não
teria perguntado sozinho.

## Escopo macro

- Questionamento de lacunas na especificação
- Padronização do texto na estrutura do nível correspondente
- Sugestão de cenários de aceitação
- Recuperação de itens semelhantes do acervo
- Controle humano sobre toda sugestão e registro de origem do conteúdo
- Governança do comportamento da IA

## Resultado esperado

O Product Owner especifica acompanhado: recebe perguntas sobre o que ficou implícito, vê como
o texto ficaria no padrão da casa e é lembrado do que a fábrica já construiu sobre assunto
parecido — decidindo, a cada passo, o que aproveitar.

## Critérios de aceitação

- **Nenhum conteúdo produzido pela inteligência artificial deve ser persistido sem ação
  explícita do usuário.**
- O sistema deve permanecer plenamente utilizável com a inteligência artificial indisponível.
- As sugestões devem seguir a estrutura definida pelo guia para o nível do item em edição.
- A origem de cada campo deve ser recuperável: escrito por pessoa, sugerido e aceito, ou
  sugerido e editado.
- O processamento deve ocorrer integralmente em infraestrutura local, sem envio de conteúdo a
  serviços externos.

---

## FT-03.1 — Copiloto de especificação

**Sprint 2** · 4 PBIs

**Descrição.** As quatro formas de apoio da IA durante a escrita: questionar, padronizar,
sugerir cenários e lembrar do acervo.

**Objetivo.** Reproduzir, de forma disponível a qualquer hora, o tipo de contribuição que um
colega experiente daria ao revisar uma especificação.

**Critérios de aceitação**

- Toda saída deve ser apresentada como proposta, visualmente distinta do conteúdo já
  registrado pelo autor.
- O tempo de resposta deve ser informado ao usuário quando ultrapassar o limite configurado.
- A indisponibilidade do serviço de IA deve ser comunicada sem interromper a edição em curso.

### PBI-03.1.1 — Questionar lacunas de um PBI · `Must`

COMO UM Product Owner
EU QUERO receber perguntas sobre o que falta na minha especificação
PARA QUE eu perceba lacunas que não teria notado sozinho.

**Cenário 1 — Apontar dimensões não cobertas**
DADO que um PBI possua apenas o cenário de caminho principal
QUANDO eu solicitar a análise de lacunas
ENTÃO o sistema deve apresentar perguntas sobre as dimensões não cobertas, entre validações,
erros, permissões, estados alternativos e interface.

**Cenário 2 — Questionar ambiguidade**
DADO que a descrição contenha uma condição sem critério verificável
QUANDO eu solicitar a análise
ENTÃO o sistema deve questionar especificamente aquela condição.

**Cenário 3 — Reconhecer especificação completa**
DADO que o PBI cubra todas as dimensões aplicáveis
QUANDO eu solicitar a análise
ENTÃO o sistema deve informar que não identificou lacunas relevantes, sem inventar
questionamentos.

**Cenário 4 — Tratar indisponibilidade**
DADO que o serviço de inteligência artificial esteja indisponível
QUANDO eu solicitar a análise
ENTÃO o sistema deve informar a indisponibilidade e manter a edição do item inalterada.

**Regras e observações.** As dimensões avaliadas são exatamente as seis da cobertura mínima
definida no guia da PRO4TECH. O modo questionador é o comportamento primário da IA na
plataforma.

### PBI-03.1.2 — Padronizar texto no formato do nível · `Must`

COMO UM Product Owner
EU QUERO ver meu texto reescrito no padrão da fábrica
PARA QUE eu não precise memorizar a estrutura de cada nível.

**Cenário 1 — Propor estrutura do nível**
DADO que eu tenha escrito uma descrição livre em um PBI
QUANDO eu solicitar a padronização
ENTÃO o sistema deve propor o conteúdo distribuído nos campos previstos para PBI, sem alterar
o item.

**Cenário 2 — Respeitar o nível do item**
DADO que eu solicite a padronização em um épico
QUANDO a proposta for apresentada
ENTÃO ela deve seguir a estrutura de épico, e não a de PBI.

**Cenário 3 — Preservar o conteúdo original**
DADO que uma proposta esteja em exibição
QUANDO eu não realizar nenhuma ação
ENTÃO o item deve permanecer exatamente como estava antes da solicitação.

### PBI-03.1.3 — Sugerir cenários de aceitação · `Should`

COMO UM Product Owner
EU QUERO receber sugestões de cenários a partir da história do usuário
PARA QUE eu tenha um ponto de partida para os critérios verificáveis.

**Cenário 1 — Sugerir a partir da história**
DADO que o PBI possua a história do usuário completa
QUANDO eu solicitar sugestões de cenários
ENTÃO o sistema deve propor cenários no formato `DADO / QUANDO / ENTÃO`.

**Cenário 2 — Cobrir caminho principal e exceção**
DADO que a história descreva uma ação sujeita a permissão
QUANDO as sugestões forem apresentadas
ENTÃO devem incluir ao menos um cenário de caminho principal e um de acesso não autorizado.

**Cenário 3 — Exigir história completa**
DADO que a história do usuário esteja incompleta
QUANDO eu solicitar sugestões
ENTÃO o sistema deve solicitar o preenchimento da história antes de sugerir cenários.

### PBI-03.1.4 — Sugerir itens semelhantes do acervo · `Must`

COMO UM Product Owner
EU QUERO ser lembrado de trabalho semelhante já realizado
PARA QUE eu reaproveite decisões em vez de recomeçar do zero.

**Cenário 1 — Sugerir durante a escrita**
DADO que eu esteja escrevendo o título e a descrição de um PBI
QUANDO houver itens semelhantes no acervo
ENTÃO o sistema deve apresentá-los com o projeto de origem, sem interromper minha digitação.

**Cenário 2 — Buscar em todos os projetos**
DADO que eu esteja especificando no Projeto A
QUANDO existir item semelhante no Projeto B
ENTÃO ele deve ser sugerido, indicando claramente que pertence a outro projeto.

**Cenário 3 — Aproveitar item sugerido**
DADO que uma sugestão esteja em exibição
QUANDO eu escolher aproveitá-la
ENTÃO o sistema deve copiar seu conteúdo para o item em edição como proposta editável e
registrar a relação de origem.

**Cenário 4 — Não sugerir quando não houver semelhança**
DADO que não exista conteúdo semelhante no acervo
QUANDO eu estiver escrevendo
ENTÃO o sistema não deve apresentar sugestões forçadas.

**Regras e observações.** Diferentemente da busca, aqui o acervo é consultado sem restrição de
projeto — o reúso entre projetos é justamente o objetivo. O isolamento por projeto se aplica à
busca e ao chat, não à sugestão de similares.

---

## FT-03.2 — Controle das sugestões

**Sprint 2** · 3 PBIs

**Descrição.** Mecanismos que garantem que a autoria da especificação permaneça humana:
decisão explícita sobre cada sugestão, registro de origem e possibilidade de dispensar
completamente a IA.

**Objetivo.** Cumprir a diretriz central definida pelo cliente — a inteligência artificial
apoia, não substitui o Product Owner — de forma verificável, e não apenas declarada.

**Critérios de aceitação**

- Nenhuma sugestão deve ser incorporada ao item sem ação explícita do usuário.
- A origem de cada campo deve permanecer registrada após a conclusão do item.
- Todas as funcionalidades de cadastro devem operar com a inteligência artificial desativada.

### PBI-03.2.1 — Aceitar, editar ou descartar sugestão · `Must`

COMO UM Product Owner
EU QUERO decidir explicitamente sobre cada sugestão
PARA QUE nada entre na especificação sem que eu tenha decidido.

**Cenário 1 — Aceitar sugestão**
DADO que uma sugestão esteja em exibição
QUANDO eu aceitá-la
ENTÃO o sistema deve incorporar o conteúdo ao item e registrar a origem como sugestão aceita.

**Cenário 2 — Editar antes de aceitar**
DADO que uma sugestão esteja em exibição
QUANDO eu alterar o conteúdo e confirmar
ENTÃO o sistema deve incorporar o conteúdo alterado e registrar a origem como sugestão editada.

**Cenário 3 — Descartar sugestão**
DADO que uma sugestão esteja em exibição
QUANDO eu descartá-la
ENTÃO o item deve permanecer inalterado e a sugestão não deve ser reapresentada
automaticamente.

**Cenário 4 — Distinguir proposta de conteúdo registrado**
DADO que existam sugestões pendentes
QUANDO eu visualizar o item
ENTÃO o conteúdo proposto deve ser visualmente distinto do conteúdo já registrado.

### PBI-03.2.2 — Consultar a origem de cada campo · `Should`

COMO UM membro da equipe
EU QUERO saber quais partes da especificação vieram de sugestão
PARA QUE eu avalie o conteúdo com o devido contexto.

**Cenário 1 — Exibir a origem**
DADO que um item possua campos de origens distintas
QUANDO eu consultar a origem do conteúdo
ENTÃO o sistema deve indicar, por campo, se foi escrito por pessoa, sugerido e aceito, ou
sugerido e editado.

**Cenário 2 — Preservar após conclusão**
DADO que o item tenha sido concluído
QUANDO eu consultar a origem posteriormente
ENTÃO o registro deve permanecer disponível.

### PBI-03.2.3 — Especificar sem a inteligência artificial · `Must`

COMO UM Product Owner
EU QUERO especificar sem qualquer participação da IA
PARA QUE meu trabalho não dependa da disponibilidade do serviço.

**Cenário 1 — Concluir item sem acionar a IA**
DADO que eu não acione nenhuma funcionalidade de apoio
QUANDO eu preencher e concluir um item
ENTÃO o sistema deve permitir a conclusão normalmente.

**Cenário 2 — Operar com o serviço indisponível**
DADO que o serviço de inteligência artificial esteja fora do ar
QUANDO eu cadastrar, editar e concluir itens
ENTÃO todas as funcionalidades de especificação e as validações estruturais devem permanecer
operantes.

**Regras e observações.** As validações de conformidade de `FT-01.3` são determinísticas e não
dependem do serviço de IA — este cenário confirma essa separação.

---

## FT-03.3 — Governança do comportamento da IA

**Sprint 2** · 2 PBIs

**Descrição.** Camada de configuração que define como a inteligência artificial atua: formato
das respostas, limites de atuação, operações disponíveis e as regras do padrão de
especificação da PRO4TECH.

**Objetivo.** Tornar o comportamento da IA um artefato configurável e versionado, e não um
efeito colateral de instrução improvisada — permitindo ajustar a atuação sem alterar o núcleo
da solução.

**Critérios de aceitação**

- Cada modo de operação deve possuir sua própria configuração de comportamento.
- Alterar a configuração de um modo não deve afetar os demais.
- As regras do guia de especificação devem ser configuração do sistema, e não interpretação do
  modelo a cada solicitação.

### PBI-03.3.1 — Configurar o comportamento por modo de operação · `Should`

COMO UM administrador
EU QUERO configurar o comportamento da IA separadamente por modo de operação
PARA QUE cada contexto de uso opere sob as regras definidas para ele.

**Cenário 1 — Manter configurações independentes**
DADO que existam os modos de levantamento, consulta e recomendação
QUANDO eu alterar a configuração de um modo
ENTÃO os demais modos devem permanecer inalterados.

**Cenário 2 — Aplicar sem reinício**
DADO que eu altere a configuração de um modo
QUANDO a alteração for salva
ENTÃO a próxima solicitação daquele modo deve utilizar a nova configuração.

### PBI-03.3.2 — Aplicar o guia de especificação como regra do sistema · `Must`

COMO UM Product Owner
EU QUERO que as sugestões respeitem o padrão da fábrica
PARA QUE eu não receba proposta fora do formato adotado.

**Cenário 1 — Propor no formato do guia**
DADO que eu solicite qualquer sugestão para um PBI
QUANDO a proposta for apresentada
ENTÃO o título proposto deve iniciar com verbo no infinitivo e a história deve conter os três
blocos previstos.

**Cenário 2 — Respeitar a granularidade do nível**
DADO que eu solicite uma sugestão para um épico
QUANDO a proposta for apresentada
ENTÃO ela não deve conter detalhes de tela ou de campo, que pertencem ao nível de PBI.

**Cenário 3 — Evitar antipadrões**
DADO que eu solicite a padronização de um texto que descreve implementação
QUANDO a proposta for apresentada
ENTÃO ela deve expressar o resultado esperado do produto, e não a tecnologia a ser utilizada.
