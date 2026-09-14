# Seed de desenvolvimento

## PRE-06 — Acervo histórico curado

O seed atual é `fixtures/historical-v1.json`, aplicado pelo backend. Contém três
projetos acadêmicos API-1/API-2/API-3, seis resumos de requisitos e seis chunks sem
vetores. As cópias curadas ficam em `curated/`. Não há pessoas, credenciais ou
competências inventadas. Cada registro tem repositório, revisão, caminho, localização,
hash SHA-256 do texto fonte em UTF-8 e descrição da transformação; a carga persiste
essa origem em `auditoria` e nos metadados dos chunks.

Dentro de `backend`, execute `npm ci`, `npm run seed:validate` e `npm run test:seed`.
Para carregar, prepare um banco dedicado com as migrações 001–003. Configure
`SEED_DATABASE_URL` por variável de ambiente (não em argumentos nem arquivos versionados)
e execute `npm run seed:apply`. O nome do banco deve terminar em `_dev` ou `_test`;
`NODE_ENV=production` é recusado. O comando de migração existente usa suas próprias
variáveis `POSTGRES_*`; confira que apontam para o mesmo banco dedicado antes de migrar.

O modo padrão só valida arquivos. A aplicação é transacional, serializada e
idempotente: repetir não duplica registros/auditoria; colisões ou alteração de
conteúdo/origem interrompem a operação, sem sobrescrever dados do usuário. Não há
remoção automática. Para atualizar o acervo, criar versão revisada e migração explícita.

`test:seed` verifica o manifesto sem PostgreSQL. Se `SEED_TEST_DATABASE_URL` estiver
definida, também testa a carga duas vezes em uma transação revertida ao final e a
recusa de divergência. A CI fornece PostgreSQL 16 + pgvector dedicado e executa as
migrações antes desse teste. Sem a variável, o teste SQL aparece como ignorado;
isso não equivale a validação da carga real.

Leia [POLITICA_DE_DADOS.md](POLITICA_DE_DADOS.md) e [validation-cases.json](validation-cases.json).
Embeddings não são fabricados: a indexação real continua pendente do pipeline da IA.

Validação local: manifesto e documentos aprovados pelo validador, build do backend
concluído e 6 testes da PRE-06 passaram com PostgreSQL 16 + pgvector descartável,
sem testes ignorados. O comando `seed:apply` também foi executado duas vezes com
sucesso: 3 projetos, 6 documentos, 6 chunks e 15 eventos de origem, sem duplicação.
O banco de teste foi removido; nenhuma carga foi feita na base corrente do projeto.
A execução remota da CI e a revisão humana do PR continuam pendentes.

## Seed fictício legado

`dev_seed.sql` contém somente dados fictícios e determinísticos para desenvolvimento
local e demonstrações. Não use este arquivo em produção e não inclua dados reais,
tokens, senhas ou documentos de clientes.

O seed é idempotente: pode ser executado novamente sem duplicar os registros com os
mesmos identificadores.

O arquivo legado é mantido por compatibilidade, não faz parte da carga histórica
PRE-06 e não deve ser executado junto com ela para demonstrar o acervo curado.
