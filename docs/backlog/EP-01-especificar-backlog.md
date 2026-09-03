# EP-01 — Especificar o backlog de produto no padrão da fábrica

**Sprints:** 1, 2 e 3 · **24 PBIs** · [← voltar ao índice](README.md)

## Descrição

Criar a experiência pela qual o Product Owner decompõe uma necessidade de produto em Épicos,
Features e PBIs seguindo o padrão documental da PRO4TECH, com o sistema garantindo a
conformidade da especificação enquanto ela é escrita. Afeta os quatro Product Owners da
fábrica e qualquer pessoa que precise ler ou revisar uma especificação depois.

## Objetivo

Eliminar a divergência de formato entre Product Owners. Hoje cada um documenta de um jeito, o
que espalha a informação e torna caro consultar o que foi definido. Ao tornar o padrão a
única forma de cadastrar, a padronização deixa de depender de disciplina individual.

## Escopo macro

- Cadastro dos quatro níveis da hierarquia com a estrutura obrigatória de cada um
- Critérios de aceitação nos três níveis, no formato que o guia define para cada nível
- Verificação automática de conformidade com o guia de especificação
- Navegação, filtro e leitura do backlog
- Registro de decisões e rastreabilidade entre itens

## Resultado esperado

Um Product Owner consegue especificar uma iniciativa completa — do Épico até os cenários de
aceitação dos PBIs — dentro da plataforma, e qualquer outra pessoa consegue ler essa
especificação e entendê-la sem depender de explicação verbal de quem a escreveu.

## Critérios de aceitação

- Não deve ser possível concluir um item de trabalho sem os campos obrigatórios definidos
  pelo guia para o seu nível.
- A estrutura de cada nível deve corresponder à definida no Guia de Especificação de Itens de
  Trabalho da PRO4TECH.
- Ao ler um PBI deve ser possível identificar a qual Feature ele contribui, e ao ler uma
  Feature deve ser possível identificar qual parte do Épico ela realiza.
- As verificações de conformidade devem funcionar sem depender de serviços externos ou de
  modelos de linguagem.
- Um item arquivado deve permanecer consultável, sem aparecer nas listagens de trabalho ativo.

---

## FT-01.1 — Estruturação dos itens de trabalho

**Sprint 1** · 6 PBIs

**Descrição.** Cadastro, edição e arquivamento dos quatro níveis da hierarquia, cada um com a
estrutura de campos que o guia define como obrigatória para aquele nível.

**Objetivo.** Dar ao Product Owner um lugar único para escrever a especificação, no formato
que a fábrica adota, sem depender de modelo de documento avulso.

**Critérios de aceitação**

- Cada nível apresenta exatamente os campos previstos no guia para aquele nível, sem misturar
  campos de níveis diferentes.
- Um item só pode ser criado dentro de um item pai válido, respeitando a hierarquia
  `Projeto → Épico → Feature → PBI`.
- Campos obrigatórios não preenchidos impedem a conclusão do item, mas não impedem salvar
  como rascunho.
- Toda alteração registra autor e data.

### PBI-01.1.1 — Cadastrar projeto · `Must`

COMO UM Product Owner
EU QUERO cadastrar um projeto na plataforma
PARA QUE eu tenha um contexto onde organizar os épicos e o conhecimento daquele cliente.

**Cenário 1 — Criar projeto com dados válidos**
DADO que eu esteja autenticado como Product Owner
QUANDO eu informar nome, cliente e descrição e confirmar a criação
ENTÃO o sistema deve criar o projeto com status "ativo" e me levar à sua tela de detalhe.

**Cenário 2 — Impedir criação sem nome**
DADO que eu esteja criando um projeto
QUANDO eu tentar confirmar sem informar o nome
ENTÃO o sistema deve impedir a criação e indicar o campo obrigatório não preenchido.

**Cenário 3 — Impedir nome duplicado**
DADO que já exista um projeto ativo com o nome informado
QUANDO eu tentar criar outro com o mesmo nome
ENTÃO o sistema deve impedir a criação e informar que o nome já está em uso.

### PBI-01.1.2 — Cadastrar épico · `Must`

COMO UM Product Owner
EU QUERO cadastrar um épico dentro de um projeto
PARA QUE eu registre a iniciativa ampla antes de detalhar as capacidades.

**Cenário 1 — Criar épico completo**
DADO que eu esteja em um projeto ativo
QUANDO eu informar título, descrição, objetivo, escopo macro e resultado esperado e confirmar
ENTÃO o sistema deve criar o épico vinculado ao projeto com status "rascunho".

**Cenário 2 — Salvar rascunho incompleto**
DADO que eu tenha preenchido apenas o título e a descrição
QUANDO eu salvar como rascunho
ENTÃO o sistema deve preservar o conteúdo e sinalizar quais campos obrigatórios ainda faltam.

**Cenário 3 — Impedir conclusão sem campos obrigatórios**
DADO que o épico esteja sem escopo macro ou sem resultado esperado
QUANDO eu tentar marcá-lo como concluído
ENTÃO o sistema deve impedir a mudança de status e listar o que falta.

**Regras e observações.** Os campos obrigatórios do épico são os cinco definidos no guia:
descrição, objetivo, escopo macro, resultado esperado e critérios de aceitação. Os critérios
são registrados no `PBI-01.2.1`.

### PBI-01.1.3 — Cadastrar feature · `Must`

COMO UM Product Owner
EU QUERO cadastrar uma feature dentro de um épico
PARA QUE eu descreva a capacidade funcional específica que realiza parte daquele épico.

**Cenário 1 — Criar feature completa**
DADO que eu esteja em um épico
QUANDO eu informar título, descrição e objetivo e confirmar
ENTÃO o sistema deve criar a feature vinculada ao épico com status "rascunho".

**Cenário 2 — Preservar o vínculo com o épico**
DADO que eu esteja visualizando uma feature
QUANDO eu abrir seus detalhes
ENTÃO o sistema deve exibir a qual épico ela pertence, com acesso ao épico de origem.

**Cenário 3 — Impedir criação fora de um épico**
DADO que eu não tenha selecionado um épico
QUANDO eu tentar criar uma feature
ENTÃO o sistema deve impedir a criação e solicitar o épico de destino.

### PBI-01.1.4 — Cadastrar PBI · `Must`

COMO UM Product Owner
EU QUERO cadastrar um Product Backlog Item dentro de uma feature
PARA QUE o comportamento a ser implementado fique descrito de forma testável.

**Cenário 1 — Criar PBI com história completa**
DADO que eu esteja em uma feature
QUANDO eu informar o título e os três blocos da história do usuário e confirmar
ENTÃO o sistema deve criar o PBI vinculado à feature com status "rascunho".

**Cenário 2 — Registrar a história em campos separados**
DADO que eu esteja preenchendo a história do usuário
QUANDO eu visualizar o formulário
ENTÃO o sistema deve apresentar `COMO UM`, `EU QUERO` e `PARA QUE` como campos distintos.

**Cenário 3 — Impedir conclusão sem cenários de aceitação**
DADO que o PBI não possua nenhum cenário de aceitação
QUANDO eu tentar marcá-lo como concluído
ENTÃO o sistema deve impedir a mudança de status e informar que ao menos um cenário é
necessário.

**Regras e observações.** A história do usuário não deve carregar as regras do item — ela dá
contexto e intenção, e os detalhes verificáveis pertencem aos cenários. A validação do título
é tratada no `PBI-01.3.1`.

### PBI-01.1.5 — Editar item de trabalho · `Must`

COMO UM Product Owner
EU QUERO editar um item de trabalho já criado
PARA QUE eu possa refinar a especificação conforme o entendimento evolui.

**Cenário 1 — Alterar campos de um item**
DADO que eu esteja visualizando um item de trabalho
QUANDO eu alterar um campo e salvar
ENTÃO o sistema deve persistir a alteração e registrar autor e data da modificação.

**Cenário 2 — Descartar alterações não salvas**
DADO que eu tenha alterações não salvas em um item
QUANDO eu tentar sair da tela
ENTÃO o sistema deve avisar sobre a perda e pedir confirmação.

**Cenário 3 — Impedir edição de item arquivado**
DADO que o item esteja arquivado
QUANDO eu abrir seus detalhes
ENTÃO o sistema deve apresentá-lo apenas para leitura.

### PBI-01.1.6 — Arquivar item de trabalho · `Should`

COMO UM Product Owner
EU QUERO arquivar um item que não é mais relevante
PARA QUE ele saia do trabalho ativo sem que o conhecimento seja perdido.

**Cenário 1 — Arquivar item**
DADO que eu esteja visualizando um item ativo
QUANDO eu confirmar o arquivamento
ENTÃO o sistema deve marcá-lo como arquivado e removê-lo das listagens de trabalho ativo.

**Cenário 2 — Arquivar em cascata**
DADO que o item possua itens filhos ativos
QUANDO eu confirmar o arquivamento
ENTÃO o sistema deve informar quantos itens filhos serão afetados e pedir confirmação
explícita.

**Cenário 3 — Consultar item arquivado**
DADO que exista um item arquivado
QUANDO eu ativar o filtro de arquivados
ENTÃO o sistema deve exibi-lo em modo leitura, com a data do arquivamento.

---

## FT-01.2 — Critérios de aceitação por nível

**Sprint 1** · 4 PBIs

**Descrição.** Registro dos critérios de aceitação nos três níveis, respeitando o formato que
o guia define para cada um: condições amplas no Épico, regras gerais na Feature e cenários
estruturados no PBI.

**Objetivo.** Garantir que cada nível seja validado na granularidade correta, evitando que
critérios de tela apareçam em épicos ou que regras transversais se percam.

**Critérios de aceitação**

- O formato do critério deve corresponder ao nível: texto livre verificável em Épico e
  Feature, e estrutura `DADO / QUANDO / ENTÃO` em PBI.
- Deve ser possível registrar múltiplos critérios em qualquer nível, com ordem definida.
- A remoção de um critério deve exigir confirmação.

### PBI-01.2.1 — Registrar critério de aceitação de épico · `Must`

COMO UM Product Owner
EU QUERO registrar critérios de aceitação amplos em um épico
PARA QUE fique claro o que caracteriza a conclusão da iniciativa como um todo.

**Cenário 1 — Adicionar critério**
DADO que eu esteja editando um épico
QUANDO eu informar o texto de um critério e confirmar
ENTÃO o sistema deve adicioná-lo à lista de critérios do épico.

**Cenário 2 — Registrar múltiplos critérios ordenados**
DADO que o épico já possua critérios
QUANDO eu adicionar outro
ENTÃO o sistema deve mantê-lo ao final da lista, preservando a ordem existente.

**Cenário 3 — Remover critério**
DADO que eu esteja visualizando um critério
QUANDO eu solicitar sua remoção e confirmar
ENTÃO o sistema deve removê-lo e reordenar os demais.

### PBI-01.2.2 — Registrar critério de aceitação de feature · `Must`

COMO UM Product Owner
EU QUERO registrar as regras gerais de uma feature como critérios de aceitação
PARA QUE as condições que valem para vários PBIs fiquem descritas uma única vez.

**Cenário 1 — Adicionar regra geral**
DADO que eu esteja editando uma feature
QUANDO eu informar o texto de um critério e confirmar
ENTÃO o sistema deve adicioná-lo à lista de critérios da feature.

**Cenário 2 — Consultar critérios da feature ao especificar um PBI**
DADO que eu esteja escrevendo um PBI de uma feature
QUANDO eu consultar o contexto da feature
ENTÃO o sistema deve exibir os critérios da feature sem que eu precise sair da tela.

### PBI-01.2.3 — Registrar cenário de aceitação de PBI · `Must`

COMO UM Product Owner
EU QUERO registrar cenários de aceitação estruturados em um PBI
PARA QUE desenvolvimento e testes saibam exatamente o comportamento esperado.

**Cenário 1 — Adicionar cenário completo**
DADO que eu esteja editando um PBI
QUANDO eu informar nome do cenário, `DADO`, `QUANDO` e `ENTÃO` e confirmar
ENTÃO o sistema deve adicionar o cenário à lista do PBI.

**Cenário 2 — Impedir cenário incompleto**
DADO que eu tenha preenchido apenas o `DADO`
QUANDO eu tentar confirmar o cenário
ENTÃO o sistema deve impedir e indicar quais blocos faltam.

**Cenário 3 — Nomear o cenário**
DADO que eu esteja criando um cenário
QUANDO eu não informar um nome
ENTÃO o sistema deve exigir um nome curto que identifique o cenário na lista.

### PBI-01.2.4 — Reordenar cenários de um PBI · `Could`

COMO UM Product Owner
EU QUERO reordenar os cenários de um PBI
PARA QUE o caminho principal apareça antes das exceções na leitura.

**Cenário 1 — Alterar a ordem**
DADO que o PBI possua mais de um cenário
QUANDO eu mover um cenário para outra posição
ENTÃO o sistema deve persistir a nova ordem e apresentá-la a todos os leitores.

---

## FT-01.3 — Conformidade com o guia de especificação

**Sprint 1** · 6 PBIs

**Descrição.** Verificação automática da especificação contra o checklist de qualidade e os
antipadrões do guia da PRO4TECH, apresentada ao autor enquanto ele escreve.

**Objetivo.** Transformar o padrão da fábrica em comportamento do sistema, para que a
qualidade da especificação não dependa de o autor lembrar das regras.

**Critérios de aceitação**

- As verificações estruturais devem ser executadas sem depender de modelo de linguagem ou de
  qualquer serviço externo.
- A sinalização deve indicar o que está incorreto e por quê, não apenas que há um problema.
- Nenhuma verificação deve impedir o autor de salvar rascunho — a conformidade é exigida para
  concluir o item, não para trabalhar nele.

### PBI-01.3.1 — Validar título do PBI · `Must`

COMO UM Product Owner
EU QUERO ser avisado quando o título do PBI não começar com verbo no infinitivo
PARA QUE o backlog mantenha a convenção de nomenclatura da fábrica.

**Cenário 1 — Aceitar título em conformidade**
DADO que eu informe o título "Consultar solicitação"
QUANDO o sistema validar o título
ENTÃO ele deve marcar a verificação de título como aprovada.

**Cenário 2 — Sinalizar título fora do padrão**
DADO que eu informe o título "Tela de usuários"
QUANDO o sistema validar o título
ENTÃO ele deve sinalizar que o título deve iniciar com verbo no infinitivo e apresentar
exemplos válidos.

**Cenário 3 — Impedir conclusão com título fora do padrão**
DADO que o título esteja sinalizado como fora do padrão
QUANDO eu tentar marcar o PBI como concluído
ENTÃO o sistema deve impedir a mudança de status.

**Regras e observações.** A validação é determinística, executada no backend de aplicação.
Verbos terminados em `-ar`, `-er`, `-ir` e `-or`, com lista de exceções configurável para
casos que a regra morfológica não cobrir.

### PBI-01.3.2 — Validar história do usuário · `Must`

COMO UM Product Owner
EU QUERO ser avisado quando a história do usuário estiver incompleta
PARA QUE ator, intenção e valor estejam sempre explícitos.

**Cenário 1 — Aprovar história completa**
DADO que os três blocos da história estejam preenchidos
QUANDO o sistema validar a história
ENTÃO ele deve marcar a verificação como aprovada.

**Cenário 2 — Sinalizar bloco ausente**
DADO que o bloco `PARA QUE` esteja vazio
QUANDO o sistema validar a história
ENTÃO ele deve sinalizar especificamente qual bloco está ausente.

**Cenário 3 — Sinalizar história que carrega regras**
DADO que um bloco da história ultrapasse o limite de extensão configurado
QUANDO o sistema validar a história
ENTÃO ele deve alertar que regras detalhadas pertencem aos cenários, sem impedir a conclusão.

### PBI-01.3.3 — Validar formato dos cenários · `Must`

COMO UM Product Owner
EU QUERO ser avisado quando os critérios do PBI não estiverem em cenários estruturados
PARA QUE os critérios permaneçam testáveis.

**Cenário 1 — Aprovar cenário estruturado**
DADO que o cenário possua `DADO`, `QUANDO` e `ENTÃO` preenchidos
QUANDO o sistema validar o cenário
ENTÃO ele deve marcar a verificação como aprovada.

**Cenário 2 — Sinalizar critério em texto livre**
DADO que o PBI possua um critério registrado fora da estrutura de cenário
QUANDO o sistema validar o item
ENTÃO ele deve sinalizar o critério e orientar a conversão para cenário.

### PBI-01.3.4 — Sinalizar termos vagos · `Should`

COMO UM Product Owner
EU QUERO ser avisado quando usar termos sem condição verificável
PARA QUE a especificação não dependa de interpretação de quem lê.

**Cenário 1 — Sinalizar termo vago**
DADO que eu escreva "o sistema deve ser rápido" em um critério
QUANDO o sistema analisar o texto
ENTÃO ele deve destacar o termo e sugerir a substituição por uma condição verificável.

**Cenário 2 — Não bloquear a conclusão**
DADO que existam termos vagos sinalizados
QUANDO eu optar por manter o texto e concluir o item
ENTÃO o sistema deve permitir a conclusão e manter o alerta visível para os leitores.

**Regras e observações.** Lista inicial extraída do guia: *adequado, rápido, intuitivo,
correto, bonito*. A lista deve ser configurável.

### PBI-01.3.5 — Consultar o checklist de qualidade do item · `Must`

COMO UM Product Owner
EU QUERO ver o checklist de qualidade aplicado ao item que estou escrevendo
PARA QUE eu saiba exatamente o que falta antes de considerá-lo pronto.

**Cenário 1 — Exibir checklist do nível correspondente**
DADO que eu esteja editando um item de trabalho
QUANDO eu abrir o painel de qualidade
ENTÃO o sistema deve apresentar apenas as verificações aplicáveis ao nível daquele item, com
o resultado de cada uma.

**Cenário 2 — Atualizar o resultado ao editar**
DADO que uma verificação esteja reprovada
QUANDO eu corrigir o campo correspondente
ENTÃO o sistema deve atualizar o resultado da verificação sem exigir recarregamento da tela.

**Cenário 3 — Navegar do checklist para o campo**
DADO que uma verificação esteja reprovada
QUANDO eu selecionar essa verificação
ENTÃO o sistema deve levar o foco ao campo que a originou.

### PBI-01.3.6 — Exibir indicador de completude · `Should`

COMO UM Product Owner
EU QUERO ver um indicador de completude do item
PARA QUE eu tenha uma noção imediata da maturidade da especificação.

**Cenário 1 — Calcular a partir do checklist**
DADO que o item possua verificações aprovadas e reprovadas
QUANDO eu visualizar o item
ENTÃO o sistema deve exibir um indicador proporcional às verificações aprovadas.

**Cenário 2 — Exibir na listagem**
DADO que eu esteja navegando o backlog
QUANDO eu visualizar a lista de itens
ENTÃO o sistema deve exibir o indicador de cada item, permitindo identificar os menos maduros.

---

## FT-01.4 — Navegação do backlog

**Sprint 1** · 3 PBIs

**Descrição.** Leitura, navegação hierárquica e filtragem do backlog de um projeto.

**Objetivo.** Permitir que qualquer pessoa localize um item e entenda seu contexto na
hierarquia sem depender de quem escreveu.

**Critérios de aceitação**

- A hierarquia deve ser visível em qualquer ponto da navegação, indicando o caminho do item
  até o projeto.
- Filtros aplicados devem permanecer ao navegar entre itens da mesma sessão.
- Listagens vazias devem apresentar orientação sobre a próxima ação, e não uma tela em branco.

### PBI-01.4.1 — Navegar a árvore do backlog · `Must`

COMO UM membro da equipe
EU QUERO navegar a hierarquia do backlog de um projeto
PARA QUE eu localize itens e entenda a qual contexto pertencem.

**Cenário 1 — Expandir a hierarquia**
DADO que eu esteja na tela de um projeto
QUANDO eu expandir um épico
ENTÃO o sistema deve exibir suas features e permitir expandi-las até os PBIs.

**Cenário 2 — Exibir o caminho do item**
DADO que eu esteja visualizando um PBI
QUANDO eu observar o cabeçalho
ENTÃO o sistema deve apresentar o caminho `Projeto → Épico → Feature → PBI`, navegável.

**Cenário 3 — Tratar projeto sem conteúdo**
DADO que o projeto não possua épicos
QUANDO eu abrir sua tela
ENTÃO o sistema deve orientar a criação do primeiro épico.

### PBI-01.4.2 — Filtrar o backlog · `Must`

COMO UM membro da equipe
EU QUERO filtrar o backlog
PARA QUE eu encontre rapidamente o subconjunto de itens que me interessa.

**Cenário 1 — Filtrar por status**
DADO que eu esteja navegando o backlog
QUANDO eu filtrar por status "rascunho"
ENTÃO o sistema deve exibir apenas os itens nesse status, preservando a hierarquia.

**Cenário 2 — Combinar filtros**
DADO que eu tenha um filtro de status ativo
QUANDO eu adicionar um filtro por tecnologia
ENTÃO o sistema deve aplicar os dois critérios simultaneamente e indicar quantos filtros estão
ativos.

**Cenário 3 — Tratar resultado vazio**
DADO que a combinação de filtros não retorne itens
QUANDO o resultado for apresentado
ENTÃO o sistema deve informar a ausência de resultados e oferecer a limpeza dos filtros.

### PBI-01.4.3 — Buscar item por texto · `Should`

COMO UM membro da equipe
EU QUERO buscar itens por texto
PARA QUE eu localize um item específico sem navegar a hierarquia inteira.

**Cenário 1 — Localizar por título**
DADO que eu informe um termo presente no título de um item
QUANDO eu executar a busca
ENTÃO o sistema deve listar os itens correspondentes com seu caminho na hierarquia.

**Cenário 2 — Buscar no conteúdo**
DADO que eu informe um termo presente na descrição de um item
QUANDO eu executar a busca
ENTÃO o sistema deve retornar o item com o trecho onde o termo aparece.

**Regras e observações.** Busca textual sobre a base relacional. A busca por significado no
acervo é tratada em `FT-02.3`, na Sprint 2.

---

## FT-01.5 — Rastreabilidade das decisões

**Sprints 1, 2 e 3** · 5 PBIs

**Descrição.** Registro do "porquê" das definições e das relações entre itens, permitindo
recuperar o raciocínio por trás da especificação.

**Objetivo.** Atender à dor levantada no kick-off — consultar depois o que foi definido **e por
quê** — que o padrão documental do cliente não cobre.

**Critérios de aceitação**

- Uma decisão deve poder ser anexada a qualquer nível da hierarquia.
- O registro de decisão nunca deve ser obrigatório para concluir um item.
- O histórico de alterações deve permitir identificar o que mudou, quando e por quem.

### PBI-01.5.1 — Registrar decisão · `Must` · Sprint 1

COMO UM Product Owner
EU QUERO registrar uma decisão e sua justificativa em um item
PARA QUE o motivo da definição não se perca quando o contexto for esquecido.

**Cenário 1 — Registrar decisão completa**
DADO que eu esteja visualizando um item de trabalho
QUANDO eu informar contexto, decisão e justificativa e confirmar
ENTÃO o sistema deve vincular a decisão ao item, com autor e data.

**Cenário 2 — Registrar alternativas descartadas**
DADO que eu esteja registrando uma decisão
QUANDO eu informar as alternativas consideradas e não adotadas
ENTÃO o sistema deve preservá-las junto da decisão.

### PBI-01.5.2 — Consultar decisões de um item · `Must` · Sprint 1

COMO UM membro da equipe
EU QUERO consultar as decisões registradas em um item e em seus ascendentes
PARA QUE eu entenda o raciocínio que levou à especificação atual.

**Cenário 1 — Listar decisões do item**
DADO que o item possua decisões registradas
QUANDO eu abrir o painel de decisões
ENTÃO o sistema deve listá-las em ordem cronológica, com autor e data.

**Cenário 2 — Herdar contexto dos níveis superiores**
DADO que eu esteja visualizando um PBI
QUANDO eu abrir o painel de decisões
ENTÃO o sistema deve indicar também as decisões registradas na feature e no épico aos quais
ele pertence.

### PBI-01.5.3 — Relacionar itens de trabalho · `Should` · Sprint 2

COMO UM Product Owner
EU QUERO relacionar um item a outro
PARA QUE dependências e semelhanças fiquem explícitas na leitura.

**Cenário 1 — Criar relação**
DADO que eu esteja visualizando um PBI
QUANDO eu selecionar outro item e o tipo de relação
ENTÃO o sistema deve registrar a relação e exibi-la nos dois itens.

**Cenário 2 — Impedir relação circular**
DADO que o item de destino já dependa do item de origem
QUANDO eu tentar criar uma dependência inversa
ENTÃO o sistema deve impedir e informar o ciclo detectado.

**Regras e observações.** Tipos de relação: depende de · similar a · substitui.

### PBI-01.5.4 — Consultar histórico de versões de um item · `Should` · Sprint 2

COMO UM membro da equipe
EU QUERO consultar o histórico de alterações de um item
PARA QUE eu identifique o que mudou na especificação e quando.

**Cenário 1 — Listar versões**
DADO que o item tenha sido alterado ao menos uma vez
QUANDO eu abrir o histórico
ENTÃO o sistema deve listar as versões com autor e data, da mais recente para a mais antiga.

**Cenário 2 — Comparar versões**
DADO que eu selecione duas versões
QUANDO eu solicitar a comparação
ENTÃO o sistema deve destacar os campos alterados entre elas.

### PBI-01.5.5 — Exportar especificação · `Could` · Sprint 3

COMO UM Product Owner
EU QUERO exportar a especificação de um épico ou feature
PARA QUE eu possa compartilhá-la com quem não tem acesso à plataforma.

**Cenário 1 — Exportar em Markdown**
DADO que eu esteja visualizando um épico
QUANDO eu solicitar a exportação em Markdown
ENTÃO o sistema deve gerar um arquivo com o épico, suas features e seus PBIs, preservando a
estrutura do guia.

**Cenário 2 — Respeitar o escopo selecionado**
DADO que eu solicite a exportação de uma feature
QUANDO o arquivo for gerado
ENTÃO ele deve conter apenas aquela feature e seus PBIs.
