# S1-04 — Interface de projetos integrada

Rotas protegidas pela S1-02: `/projects`, `/projects/new` e `/projects/:id`.
A autenticação e a restauração usam a S1-01. Acesso direto retorna ao destino após
login; um 401 em projetos informa expiração e solicita nova autenticação.

## Contrato da S1-03

- GET `/api/v1/projects?limit=50&offset=0`: `{ items, total, limit, offset }`.
- POST `/api/v1/projects`: retorna o objeto Project diretamente, com status HTTP 201.
- GET `/api/v1/projects/:id`: retorna Project diretamente.
- Nome e cliente são obrigatórios, limitados a 255 caracteres; descrição é opcional.
- Descrição nula é apresentada como texto vazio. Status aceitos: `ativo`,
  `em_andamento`, `concluido` e `arquivado`.

A lista tem paginação, carregamento, erro com nova tentativa e estado vazio.
O formulário valida campos, impede envio duplicado, conserva dados após falha,
informa conflito de nome (409) e abre o detalhe depois da criação.

PO e administrador podem escrever. Desenvolvedor tem acesso de leitura;
o formulário é bloqueado e os botões de criação ficam ocultos. A API também
recusa escrita com 403, inclusive pelo alias `/api/projects`.
O servidor determina a autoria pela sessão e registra a criação em auditoria.

## Validação

- Frontend: `npm test` e `npm run build`.
- Backend: `npm run build` e `npm test`.
- Integração com PostgreSQL descartável: `npm run test:integration:s1` no backend.
  Exige NODE_ENV=test, POSTGRES_DB terminado em `_s1_validation`, demais variáveis
  de conexão e migrações previamente aplicadas. O script insere dados de teste;
  deve ser executado exclusivamente em banco descartável.

O teste integrado usa as funções HTTP reais do frontend, a aplicação Express
real e PostgreSQL; verifica autenticação, contratos, permissões, paginação,
validação de campos, unicidade de nome e auditoria.
Veja `docs/VALIDACAO_S1.md` para resultados e condições de encerramento.
