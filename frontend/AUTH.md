# S1-02 — Autenticação no frontend

Login, logout, restauração de sessão e proteção das páginas internas integrados
à S1-01. A sessão usa cookie HttpOnly, sem credenciais no armazenamento do navegador.

## Contrato implementado

- `POST /api/v1/auth/login`: `{ email, password }`; retorna `{ user: { id, nome, email, role } }`.
- `GET /api/v1/auth/me`: restaura a sessão com o mesmo formato de usuário.
- `POST /api/v1/auth/logout`: revoga a sessão; retorna 204.

O adaptador do frontend converte `nome` para o campo visual `name` e valida o papel.
401 exige login; 403 informa acesso indisponível; 429 informa limite de tentativas.
Erros de rede e respostas inválidas bloqueiam o conteúdo com opção de tentar novamente.
A saída só é confirmada após sucesso ou 401 do servidor.

Rotas protegidas: `/`, `/requirements` e `/rag`. Destinos de retorno são validados
em `src/auth/navigation.ts`, preservando filtros e fragmentos de páginas conhecidas.
A sessão é revalidada ao navegar, usar o histórico e recuperar foco, sem polling.
O cliente HTTP compartilhado informa expiração ao receber 401 em recursos privados.

## Validação

No frontend: `npm test` e `npm run build`.
No backend: `npm ci`, `npm run build` e `npm test`.
Os testes do frontend usam o contrato da S1-01; os testes HTTP do backend cobrem
cookies, autenticação e consulta da sessão, com repositórios em memória.

Para execução com PostgreSQL, configure os arquivos de ambiente conforme o README,
aplique as migrações (inclusive `004_identity_domain.sql`) e utilize um usuário
ativo com hash de senha compatível com a S1-01. O proxy Vite encaminha `/api` à
porta 3001; o frontend inicia na porta 5173.
