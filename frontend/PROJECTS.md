# S1-04 — Interface de projetos

Escopo do PBI-01.1.1: listagem, formulário de cadastro e detalhe. Rotas:
`/projects`, `/projects/new` e `/projects/:id`. Este commit é independente da S1-02;
a guarda de autenticação e o retorno após login serão conectados na integração.

O formulário coleta nome, cliente e descrição. Nesta proposta, os três campos são
obrigatórios e espaços nas extremidades são removidos antes do envio. Ausência de
nome bloqueia a requisição, marca o campo e move o foco até ele. Dados preenchidos
mostram o estado válido. Durante o envio, os campos e botões ficam desabilitados.
Sucesso abre o detalhe retornado pelo servidor, exibindo seu status.

Listagem e detalhe possuem carregamento, erro e nova tentativa; lista sem projetos
oferece criação do primeiro. Nome duplicado (409) gera mensagem no campo nome;
erros preservam os dados digitados. Falha ambígua de criação orienta consultar a
lista antes de repetir o POST. Não há tentativas automáticas de criação.

## Contrato proposto para a S1-03 — integração pendente

O backend e o banco não foram alterados. A S1-01 e a S1-03 continuam sob
responsabilidade de seus respectivos responsáveis. Não há dados fictícios em produção.

| Método e endpoint | Resposta esperada |
| --- | --- |
| GET `/api/v1/projects` | 200 `{ "projects": [Project] }` (lista vazia: `[]`) |
| POST `/api/v1/projects` | 201 `{ "project": Project }` |
| GET `/api/v1/projects/:id` | 200 `{ "project": Project }` |

Corpo do POST: `{ "nome": "Sinapse", "cliente": "Cliente", "descricao": "Contexto" }`.
Project: `{ "id": "identificador", "nome": "Sinapse", "cliente": "Cliente", "descricao": "Contexto", "status": "ativo" }`.
IDs aceitos: letras ASCII, números, hífen e sublinhado (inclui UUID); `new` é reservado
para a rota do formulário. Status aceitos: `ativo` e `arquivado`.

A S1-03 deve definir status ativo na criação, validar unicidade de nome ativo,
autorizar cadastro apenas para Product Owner, validar campos e registrar auditoria.
O cliente não envia status, autoria ou papel. A integração com a S1-02 deverá fornecer
o papel para condicionar a exibição do botão; 403 exibe orientação sem sucesso falso.

Erros: 400/422 (dados inválidos), 401 (orientação para entrar; redirecionamento depende da S1-02),
403 (sem permissão), 404 (detalhe inexistente), 409 (nome ativo duplicado).
Endpoints, envelopes, campos obrigatórios e paginação devem ser alinhados com a S1-03
e formalizados no OpenAPI antes da integração. O contrato inicial não prevê paginação.

## Validação

`npm test` cobre estados vazio, carregando, válido, inválido e erro, nome duplicado,
envio único, preservação de dados, navegação ao detalhe e reconhecimento das rotas.
`npm run build` valida TypeScript e o bundle.

Pendências para conclusão integrada: testar com autenticação e API reais, confirmar
criação ativa e autorização de PO, validar unicidade/auditoria no servidor, revisar
visualmente em navegador e obter revisão do PR por outra pessoa.
