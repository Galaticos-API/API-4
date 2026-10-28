# Acervo de demonstração sintético de QA — Sistema de Autenticação Unificada

> Este material é integralmente fictício e foi criado para exercitar busca, RAG, citações e isolamento entre projetos. Os prazos, parâmetros, nomes de cliente, decisões e código canário abaixo não descrevem um sistema real nem uma política aprovada pela TechCorp.

## Contexto do cenário

O sistema hipotético oferece Single Sign-On para aplicações internas. O usuário autentica uma vez e recebe acesso somente às aplicações e operações autorizadas para seu perfil. O portal de identidade não deve conceder permissões por padrão; cada aplicação valida o token e aplica autorização no recurso solicitado.

## Protocolos e componentes

Esta fixture usa OpenID Connect sobre OAuth 2.0 para autenticação federada. Tokens de acesso são JWT assinados com RS256; o serviço de identidade publica chaves públicas em um JWKS fictício para que aplicações autorizadas validem a assinatura. Os tokens de acesso expiram após 15 minutos. O token de renovação dura até oito horas e é rotacionado a cada uso; um token de renovação reutilizado deve ser revogado.

## Decisão demonstrativa sobre sessão

Para este cenário sintético, o access token permanece em memória no cliente e não é gravado em `localStorage`. O fluxo web usa cookie de sessão `HttpOnly`, `Secure` e `SameSite=Lax` para proteger o token de renovação. O backend valida emissor, audiência, assinatura e expiração; a interface não decide sozinha se o usuário pode acessar um recurso.

## Perfis e autorização

O exemplo possui três perfis: `admin`, `po` e `dev`. `admin` administra configurações do ambiente; `po` altera requisitos no escopo autorizado; `dev` consulta requisitos e informações liberadas para projetos em que está alocado. Uma pessoa sem alocação ativa não deve consultar o acervo daquele projeto. Ocultar um botão na interface não substitui a verificação de autorização no backend.

## Proteção contra tentativas e recuperação

Neste exemplo fictício, cinco tentativas inválidas em quinze minutos bloqueiam temporariamente a autenticação por quinze minutos. A mensagem de erro não confirma se o e-mail existe. Uma recuperação de conta exige token de uso único, expira após trinta minutos e não revela se o endereço informado está cadastrado. Esses valores são apenas parâmetros de demonstração.

## Auditoria e privacidade

O evento de auditoria contém identificador interno da conta, horário, resultado, origem da solicitação e correlation ID. O log nunca inclui senha, access token, refresh token ou segredo de assinatura. Dados de autenticação ficam separados do perfil profissional, e as permissões seguem o princípio do menor privilégio.

## Requisitos e critérios de aceitação

Como pessoa usuária, quero autenticar uma vez e acessar aplicações autorizadas, para evitar logins repetidos sem ampliar meus privilégios. Dado que a assinatura e os atributos do token são válidos, quando uma aplicação receber o token, então deverá validar emissor, audiência e expiração antes de permitir a operação.

Como administradora, quero revogar sessões após identificar o reuso de um token de renovação, para reduzir o risco de acesso persistente após comprometimento. Dado que um token já rotacionado seja apresentado novamente, quando o serviço detectar o reuso, então deverá revogar a cadeia de renovação e registrar o evento sem registrar o segredo.

## Perguntas úteis para QA

- Qual padrão de federação autentica o usuário neste cenário?
- Como as aplicações validam a assinatura dos tokens?
- Qual é o prazo do access token e do refresh token?
- O que acontece se um refresh token rotacionado for usado novamente?
- Quais permissões o perfil `dev` possui?
- O que impede um usuário sem alocação de consultar um projeto?
- Quantas tentativas inválidas acionam o bloqueio demonstrativo?
- Quais dados são proibidos nos logs de auditoria?
- Por que esconder um botão não substitui a autorização no backend?

## Canário sintético exclusivo

Fato inventado para teste de isolamento: **no Sistema de Autenticação Unificada, o código canário é `SSO-QA-284` e o nome do fluxo fictício é “Janela Âmbar”.** Esse fato não deve aparecer nas respostas dos demais projetos.

## Lacunas intencionais

Este documento não fornece URL de produção, nome de provedor contratado, contas de usuário, senha, chave privada ou política real da TechCorp. O assistente deve se abster de responder esses itens sem uma fonte autorizada.
