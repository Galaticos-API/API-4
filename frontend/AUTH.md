# S1-02 — Autenticação no frontend

Implementa login, saída, restauração pelo servidor antes de exibir conteúdo interno,
guarda de todas as páginas, tratamento de 401 e retorno após login. Rotas:
`/login` (pública), `/`, `/requirements` e `/rag` (protegidas).
Query string e fragmento do destino são preservados. Somente rotas internas
conhecidas são aceitas em `returnTo`; destinos externos e páginas de autenticação
retornam para `/`. Novas páginas precisam ser adicionadas em `src/auth/navigation.ts`.

## Dependência pendente: S1-01

O backend não foi alterado. A autenticação real depende da implementação da S1-01
por seu responsável. O contrato abaixo é uma proposta de integração a alinhar com ele;
não há usuário fictício nem mecanismo de autenticação local no aplicativo.

| Endpoint | Requisição | Sucesso |
| --- | --- | --- |
| `POST /api/v1/auth/login` | JSON `{ "email": "...", "password": "..." }` | 200, `{ "user": { "id": "...", "name": "...", "email": "..." } }` e cookie de sessão |
| `GET /api/v1/auth/session` | Cookie de sessão | 200, mesmo objeto `user` |
| `POST /api/v1/auth/logout` | Cookie de sessão | 204, sessão revogada e cookie removido |

Erros esperados: 401 para credenciais inválidas/sessão ausente ou expirada;
403 para acesso desabilitado; 429 para excesso de tentativas. Falhas de rede,
respostas inválidas e erros do servidor bloqueiam o conteúdo com opção de tentar
novamente. Uma falha na saída não é apresentada como revogação bem-sucedida.

A S1-01 deverá gerenciar cookie HttpOnly, Secure em produção e SameSite, validar
origem/CSRF nas operações de escrita, revogar sessões e aplicar expiração por
inatividade e autorização em cada endpoint. O frontend usa o proxy de mesma origem
existente no Vite/Nginx e não armazena credenciais em localStorage/sessionStorage.
Usar `apiRequest` para futuras chamadas autenticadas permite tratar 401 globalmente.
A sessão também é revalidada ao voltar à janela e ao navegar, inclusive pelo
histórico Voltar/Avançar. O conteúdo fica oculto durante a verificação. Se uma
sessão anteriormente validada receber 401, o login informa a expiração e preserva
o destino solicitado. Não há polling que prolongue a inatividade. A guarda visual
não substitui a autorização do backend.

## Validação

`npm test` executa testes com API simulada, exclusivos dos testes; `npm run build`
verifica TypeScript e gera o bundle. Para integração real, após a S1-01, verificar:
login válido/inválido, usuário inativo, limite de tentativas, recarga autenticada,
acesso direto a `/requirements?filter=active#list`, expiração, saída e botão Voltar.

Os testes cobrem também orientação para 403/429, 401 em chamada autenticada,
expiração ao recuperar foco/navegar/usar histórico, bloqueio durante revalidação
e ausência de aviso de expiração indevido no primeiro acesso.

Pendências externas para encerramento: alinhar este contrato e sua especificação
OpenAPI com o responsável pela S1-01, validar os fluxos com o backend real e obter
revisão do PR por outra pessoa. A S1-01 permanece fora desta implementação.
