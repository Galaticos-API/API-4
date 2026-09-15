# Validação S1-01, S1-02 e S1-04

Data: 15/09/2026. Repositório: Galaticos-API/API-4.
Base recebida: origin/main e0c5440, contendo a S1-01 do PR #15.
Resultado: validação técnica aprovada na versão local integrada descrita abaixo.

## Implementação validada

- S1-02: commit cf2ce26 na branch `S1-02]-Criar-login/logout-no-frontend,-restauração-de-sessão,-guarda-de-rotas-e-retorno-seguro-ao-destino-original`. Restauração em `/auth/me`, adaptação de `nome`,
  validação do papel, login/logout e guarda de rotas.
- S1-04: commit d75d832 na branch `S1-04]-Implementar-tela-de-projetos-e-formulário-com-estados-válido,-inválido,-carregando,-erro-e-vazio`. Inclui S1-02, contratos da S1-03, paginação,
  descrição opcional/nula, quatro status de projeto e tratamento global de 401.
- Correção complementar a832534 na branch `fix/s1-01-project-permissions`: desenvolvedor tem leitura; PO e administrador
  podem escrever. A API aplica a regra em criação, atualização e arquivamento,
  tanto em `/api/v1/projects` quanto em `/api/projects`. Essa correção é a base das branches S1-02 e S1-04.

## Evidências

| Verificação | Resultado |
| --- | --- |
| Build S1-02 | Aprovado |
| Testes frontend S1-02 | 25 aprovados |
| Build frontend integrado S1-04 | Aprovado |
| Testes frontend integrado | 42 aprovados em 3 arquivos |
| Build backend | Aprovado |
| Testes backend | 46 aprovados, zero falhas |
| Migrações PostgreSQL | 001 a 004 aplicadas; segunda execução sem reaplicação |
| Integração HTTP + PostgreSQL real | 13 cenários aprovados |
| Navegador com frontend e backend reais | Fluxo aprovado |

O teste integrado usa diretamente os clientes HTTP TypeScript do frontend e a
aplicação Express, sem respostas HTTP ou repositórios simulados. Foi executado
em PostgreSQL 16 com pgvector, em container descartável exclusivo de validação.

### S1-01 — critérios exercitados

- Login válido; resposta consumida pelo frontend e restauração via `/auth/me`.
- Erro genérico igual para senha incorreta e identificador inexistente.
- Bloqueio por tentativas consecutivas, 429 e liberação após prazo configurado.
- Usuário inativo recusado; sessão existente invalidada após desativação.
- Senha com hash; token de sessão persistido somente como SHA-256.
- Cookie HttpOnly, SameSite=Lax e Path=/.
- Perfis admin, po e dev restaurados da base; papel inválido recusado pelo banco.
- Rotas privadas e alias recusam acesso sem cookie.
- Expiração por inatividade e duração absoluta; revogação persistida no banco.
- Logout remove cookie e impede reutilização do token revogado.
- Controle de escrita por papel após a correção complementar.

### S1-02 e S1-04 — critérios exercitados

- Acesso direto a projeto solicita login e conserva o destino.
- Navegação autenticada, recarga e restauração de sessão.
- 401 em projetos informa expiração e retorna ao login.
- Cadastro, listagem e detalhe no contrato real; paginação além de 50 itens.
- Nome/cliente obrigatórios, nome duplicado (409), projeto inexistente (404).
- Criação com status ativo e autoria da sessão registrada em auditoria.
- Descrição nula e status em_andamento/concluido aceitos pelo cliente.
- Desenvolvedor sem formulário de criação e sem acesso de escrita à API.
- Estados de carregamento, vazio, erro, válido e inválido, sem envio duplicado.

No navegador foram confirmados: redirecionamento de `/projects/new`, login com
usuário fictício do banco temporário, erros de formulário vazio, criação e detalhe,
recarga autenticada, logout e botão Voltar mantendo a tela de autenticação.
A tela de detalhe também foi inspecionada visualmente.

## Reprodução da integração

1. Crie um PostgreSQL descartável com pgvector e nome de banco terminado em
   `_s1_validation`. Não use dados de desenvolvimento ou produção.
2. No backend, configure NODE_ENV=test e POSTGRES_HOST/PORT/USER/PASSWORD/DB.
3. Execute `npm ci`, `npm run migrate` e repita `npm run migrate`.
4. Execute `npm run build`, `npm test` e `npm run test:integration:s1`.
5. No frontend, execute `npm ci`, `npm run build` e `npm test`.

O script de integração insere usuários/projetos e altera suas sessões para
exercitar expiração e bloqueio. Recusa bancos sem o sufixo exigido; descarte o
ambiente de teste ao terminar.

## Encerramento do card

A validação técnica está aprovada para os commits locais acima. A S1-01 recebida
já atendia aos cenários de autenticação e sessão; a revisão identificou e corrigiu
uma lacuna de autorização de escrita em projetos.

Os novos commits ainda não foram enviados ao GitHub nem incorporados à main.
Se o estado Concluído do Trello exige entrega na main, primeiro publique/revise e
integre essas alterações, especialmente a correção de permissões. Até lá, o
registro adequado é validação aprovada com integração pendente.

Texto sugerido para o card:

> Validação técnica executada em 15/09/2026: builds aprovados, 46 testes backend,
> 42 testes frontend integrado e 13 cenários HTTP com PostgreSQL real aprovados.
> Login, bloqueio de tentativas, usuário inativo, sessões, expiração, logout,
> proteção de rotas e integração com projetos verificados. Fluxo confirmado no
> navegador. Corrigida autorização de escrita por perfil. Novos commits locais
> aguardam publicação/revisão e integração na main.

A validação usou HTTP local. Não foi realizado ensaio de implantação HTTPS de
produção nem validação das outras funcionalidades fora dessas tarefas.

## Organização dos commits para revisão

As duas branches originais do usuário são as branches de trabalho. As versões anteriores e alternativas foram preservadas em branches backup/. A reorganização manteve exatamente o
código testado: a árvore completa da nova S1-02 foi comparada com 99264b2, e os
arquivos de implementação da nova S1-04 com 61d94c6, sem diferenças.

| Branch | Base de revisão | Conteúdo próprio |
| --- | --- | --- |
| `fix/s1-01-project-permissions` | `main` | Middleware, regras de escrita de projetos, teste e OpenAPI |
| `S1-02]-Criar-login/logout-no-frontend,-restauração-de-sessão,-guarda-de-rotas-e-retorno-seguro-ao-destino-original` | `fix/s1-01-project-permissions` | Login, logout, restauração, proteção de rotas e testes |
| `S1-04]-Implementar-tela-de-projetos-e-formulário-com-estados-válido,-inválido,-carregando,-erro-e-vazio` | `S1-02]-Criar-login/logout-no-frontend,-restauração-de-sessão,-guarda-de-rotas-e-retorno-seguro-ao-destino-original` | Telas de projetos, adaptação de contratos, paginação e testes integrados |

Integre nessa ordem. Ao revisar as branches antes dos merges, use a base indicada
para que o diff mostre apenas o escopo daquela tarefa. Os commits são locais;
nenhuma branch foi publicada por esta reorganização.


Os commits originalmente publicados nas branches S1-02 e S1-04 continuam no histórico das respectivas branches. Ambas mantêm o upstream original. A reorganização dos commits locais não exige force push em relação aos remotos conhecidos.
