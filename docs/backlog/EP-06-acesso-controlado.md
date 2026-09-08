# EP-06 — Operar a plataforma com acesso controlado

**Sprints:** 1 e 3 · **5 PBIs** · [← voltar ao índice](README.md)

## Descrição

Garantir que o acervo de conhecimento da fábrica seja acessível apenas a pessoas autorizadas,
com as permissões previstas para o papel de cada uma, e que o vocabulário técnico usado para
classificar o conteúdo permaneça consistente ao longo do tempo.

## Objetivo

O acervo concentra a especificação de todos os projetos e clientes da fábrica. Seu valor
depende de estar disponível a quem precisa e protegido de quem não deveria acessá-lo.

## Escopo macro

- Autenticação e sessão
- Perfis de acesso por papel
- Padronização dos nomes de tecnologias usados para classificar itens e competências

## Resultado esperado

Cada pessoa acessa a plataforma com o nível de permissão previsto para o seu papel, e a mesma
tecnologia é sempre registrada com o mesmo nome, sem variações de escrita que fragmentem as
buscas.

## Critérios de aceitação

- Nenhuma funcionalidade deve ser acessível sem autenticação.
- A alteração de permissões deve produzir efeito sem exigir nova implantação.
- Nomes de tecnologia em uso não devem poder ser removidos sem tratamento das associações
  existentes.

---

## FT-06.1 — Acesso à plataforma

**Sprint 1** · 3 PBIs

**Descrição.** Autenticação, encerramento de sessão e proteção das funcionalidades contra
acesso não autenticado.

**Objetivo.** Estabelecer a identidade do usuário, da qual dependem a autoria dos itens, o
histórico de conversas e o controle de permissões.

**Critérios de aceitação**

- Credenciais inválidas não devem revelar se o problema está no identificador ou na senha.
- A sessão deve expirar após período de inatividade configurável.
- Senhas devem ser armazenadas de forma irreversível.

### PBI-06.1.1 — Autenticar usuário · `Must`

COMO UM membro da equipe
EU QUERO acessar a plataforma com minhas credenciais
PARA QUE meu trabalho seja identificado e minhas permissões aplicadas.

**Cenário 1 — Autenticar com credenciais válidas**
DADO que eu possua cadastro ativo
QUANDO eu informar e-mail e senha corretos
ENTÃO o sistema deve iniciar minha sessão e apresentar a tela inicial.

**Cenário 2 — Recusar credenciais inválidas**
DADO que eu informe credenciais incorretas
QUANDO eu tentar autenticar
ENTÃO o sistema deve recusar o acesso com mensagem genérica, sem indicar qual campo está
incorreto.

**Cenário 3 — Recusar usuário inativo**
DADO que meu cadastro esteja inativo
QUANDO eu informar credenciais corretas
ENTÃO o sistema deve recusar o acesso e orientar o contato com o administrador.

**Cenário 4 — Limitar tentativas consecutivas**
DADO que ocorram tentativas malsucedidas acima do limite configurado
QUANDO nova tentativa for realizada
ENTÃO o sistema deve bloquear temporariamente as tentativas para aquele identificador.

### PBI-06.1.2 — Encerrar sessão · `Must`

COMO UM membro da equipe
EU QUERO encerrar minha sessão
PARA QUE meu acesso não permaneça aberto em um equipamento compartilhado.

**Cenário 1 — Encerrar manualmente**
DADO que eu esteja autenticado
QUANDO eu solicitar o encerramento da sessão
ENTÃO o sistema deve encerrá-la e retornar à tela de autenticação.

**Cenário 2 — Expirar por inatividade**
DADO que eu permaneça inativo além do período configurado
QUANDO eu tentar realizar uma ação
ENTÃO o sistema deve informar a expiração e solicitar nova autenticação.

### PBI-06.1.3 — Bloquear acesso não autenticado · `Must`

COMO UM administrador
EU QUERO que as funcionalidades exijam autenticação
PARA QUE o acervo não fique exposto.

**Cenário 1 — Redirecionar acesso direto**
DADO que eu não esteja autenticado
QUANDO eu acessar diretamente o endereço de uma funcionalidade interna
ENTÃO o sistema deve me redirecionar à tela de autenticação.

**Cenário 2 — Retomar o destino após autenticar**
DADO que eu tenha sido redirecionado a partir de um endereço específico
QUANDO eu me autenticar com sucesso
ENTÃO o sistema deve me levar ao destino originalmente solicitado.

**Cenário 3 — Recusar requisição sem credencial válida**
DADO que uma requisição seja feita sem credencial válida
QUANDO ela alcançar a interface de programação
ENTÃO o sistema deve recusá-la sem retornar dado algum.

---

## FT-06.2 — Administração

**Sprint 3** · 2 PBIs

**Descrição.** Gestão dos perfis de acesso e da lista padronizada de nomes de tecnologias.

**Objetivo.** Permitir que a plataforma seja mantida pelo próprio time da fábrica, sem exigir
alteração de código para operações rotineiras.

**Critérios de aceitação**

- Alterações administrativas devem registrar autor e data.
- Não deve ser possível remover o último usuário com perfil de administrador.

### PBI-06.2.1 — Gerenciar perfis de acesso · `Should`

COMO UM administrador
EU QUERO definir o perfil de acesso de cada usuário
PARA QUE cada pessoa tenha exatamente as permissões previstas para o seu papel.

**Cenário 1 — Atribuir perfil**
DADO que eu esteja na administração de usuários
QUANDO eu atribuir um perfil a um usuário
ENTÃO as permissões correspondentes devem valer no próximo acesso dele.

**Cenário 2 — Restringir o perfil de leitura**
DADO que um usuário possua perfil de desenvolvedor
QUANDO ele acessar um item de trabalho
ENTÃO ele deve visualizá-lo sem possibilidade de edição.

**Cenário 3 — Preservar ao menos um administrador**
DADO que exista um único usuário com perfil de administrador
QUANDO eu tentar alterar o perfil dele
ENTÃO o sistema deve impedir a alteração.

### PBI-06.2.2 — Padronizar os nomes de tecnologias usados no acervo · `Should`

COMO UM administrador
EU QUERO manter uma lista única de nomes de tecnologias
PARA QUE a mesma tecnologia não seja registrada de várias formas e fragmente as buscas.

**Cenário 1 — Selecionar de uma lista ao classificar**
DADO que eu esteja associando tecnologias a um item de trabalho ou a um perfil profissional
QUANDO eu digitar o nome
ENTÃO o sistema deve oferecer as tecnologias já cadastradas, em vez de aceitar texto livre.

**Cenário 2 — Incluir tecnologia nova**
DADO que a tecnologia ainda não exista na lista
QUANDO eu cadastrá-la com nome e categoria
ENTÃO ela deve passar a estar disponível para associação.

**Cenário 3 — Impedir variações de escrita**
DADO que já exista "Node.js" cadastrado
QUANDO alguém tentar cadastrar "NodeJS"
ENTÃO o sistema deve apontar o registro existente e oferecer utilizá-lo.

**Cenário 4 — Tratar remoção de tecnologia em uso**
DADO que a tecnologia esteja associada a itens ou competências
QUANDO eu tentar removê-la
ENTÃO o sistema deve informar quantas associações existem e exigir confirmação explícita.

**Regras e observações.** Reescrito após a revisão da PRO4TECH em 08/09, que apontou não ter
compreendido a funcionalidade na redação anterior. É o que sustenta a busca por tecnologia do
`PBI-02.3.2` e as consultas sobre a equipe do `PBI-05.2.1`: sem uma lista única, a pergunta
"quem já trabalhou com Node?" devolve resultados parciais, porque cada pessoa terá escrito o
nome de um jeito.
