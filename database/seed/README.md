# Seeds e dados de demonstração

Este diretório contém dois conjuntos com propósitos diferentes:

1. `fixtures/historical-v1.json` e `curated/` formam o **acervo histórico curado PRE-06 v1**.
2. `fixtures/historical-v2.json` e `curated/v2/` preservam os textos da v1 em IDs isolados e acrescentam `GRF-01`/`GRF-08` como metadados pesquisáveis. A v1 continua intacta. V2 é opt-in com `SEED_DATASET_VERSION=2`; sem essa variável, a ferramenta continua usando v1.
3. `dev_seed.sql` é um seed legado com dados fictícios determinísticos para demonstrações. Ele não faz parte da carga PRE-06 e não deve ser aplicado junto dela.

Não inclua nomes, e-mails, credenciais, documentos de clientes, dados de produção ou segredos em qualquer fixture.

## Validar o acervo curado

Execute dentro de `backend`:

```bash
npm ci
npm run build
npm run seed:validate
npm run test:seed
```

O build é necessário porque os scripts `seed:validate` e `test:seed` executam arquivos compilados em `dist/`. A validação padrão inspeciona o manifesto e os documentos sem gravar dados. O teste PostgreSQL é habilitado quando `SEED_TEST_DATABASE_URL` aponta para banco descartável dedicado.

## Aplicar em desenvolvimento

1. Crie um banco dedicado, separado da base de desenvolvimento compartilhada.
2. Aplique nele as migrations necessárias (001–003 para este dataset).
3. Configure `SEED_DATABASE_URL` no ambiente do processo, sem colocar a URL em argumentos ou arquivos versionados.
4. Confirme que `POSTGRES_*` do comando de migration aponta para o mesmo destino.
5. Execute `npm run seed:apply` dentro de `backend`.

Para validar ou aplicar explicitamente a versão 2, configure `SEED_DATASET_VERSION=2` no ambiente do processo. A versão padrão permanece v1.

O alvo precisa usar PostgreSQL/PostgresQL e o nome do banco deve terminar em `_dev` ou `_test`. O ambiente `production` é recusado, salvo a exceção explícita de segurança prevista no código; **não use a exceção para dados de demonstração**.

A aplicação é transacional e idempotente: repetir os mesmos dados não duplica registros. Colisões ou divergência de conteúdo/origem abortam a operação; o seed não atualiza nem remove conteúdo preexistente.

## Conteúdo e proveniência

Cada item curado mantém origem, URL, revisão, caminho/localização, hash SHA-256 e descrição da transformação. Os metadados permitem rastrear a origem do texto. Embeddings não são fabricados; a inclusão de vetor depende de pipeline de indexação validado.

Leia a [política de dados](POLITICA_DE_DADOS.md), o [manifesto de casos de validação](validation-cases.json) e o [guia de migrations](../migrations/README.md).

## Capturas e demonstrações do produto

As capturas do [README principal](../../README.md) foram produzidas com registros inventados em banco descartável pela UI. Elas não usam `dev_seed.sql` nem alteram a base do Compose do desenvolvedor.
