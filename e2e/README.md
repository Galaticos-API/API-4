# Testes E2E de navegador

Os cenários exercitam a aplicação no Chrome usando frontend, backend e PostgreSQL reais. Eles complementam, mas não substituem, os testes unitários e de integração dos módulos.

## Pré-requisitos

- PostgreSQL/pgvector dedicado com migrations aplicadas.
- Backend acessível em `http://localhost:3001` e `DOCUMENT_STORAGE_DIR` gravável.
- Frontend acessível em `http://localhost:5173` e encaminhando `/api` ao backend.
- Chrome ou Chromium instalado.
- Node.js 20+.

O serviço de IA não é necessário: o conjunto valida também o comportamento quando o serviço está indisponível. Não rode a suíte sobre banco compartilhado ou de produção; cada cenário cria usuários, projetos e dados próprios.

## Cobertura

| Arquivo | Principais fluxos |
|---|---|
| `tests/documents.e2e.mjs` | Upload, lista, remoção, perfis, projeto arquivado, isolamento, limite, cursor e abas. |
| `tests/assistants.e2e.mjs` | RepoAnalyzer, chat e limites de cadastro público. |
| `tests/flows.e2e.mjs` | Projetos, arquivamento, hierarquia, qualidade, busca, decisões e autorização. |
| `tests/hierarchy-ui.e2e.mjs` | Criação de épico → feature → PBI, critérios e arquivamento pelas telas. |
| `tests/a11y.e2e.mjs` | axe WCAG 2 A/AA em telas principais e navegação/foco por teclado. |

## Executar localmente

Configure as URLs para os serviços ativos (os padrões já são os da tabela de pré-requisitos):

```bash
cd e2e
npm ci
npm test
```

Para executar um arquivo isolado:

```bash
node --test tests/documents.e2e.mjs
```

Variáveis opcionais: `E2E_API_URL`, `E2E_APP_URL`, `E2E_CHROME_PATH` e `E2E_TIMEOUT_MS`. `E2E_API_URL` deve incluir o prefixo `/api/v1`.

## GitHub Actions

O workflow [E2E (navegador)](../.github/workflows/e2e.yml) roda automaticamente em pull requests para `main` e em pushes para `main` quando mudanças afetam backend, frontend, banco, E2E, Compose ou o próprio workflow. Também pode ser iniciado manualmente pelo `workflow_dispatch`.

Cada execução de CI provisiona PostgreSQL descartável, aplica migrations, inicia frontend/backend e executa os cenários no Chrome. O job publica logs dos serviços quando falha.

## Preparação de identidades e isolamento

Defina E2E_DATABASE_URL para PostgreSQL descartável cujo banco se chama sinapse_e2e_test; npm test recusa outro nome. O setup cria somente o administrador de teste nesse banco. POs são cadastrados pela API autenticada, desenvolvedores pela API pública, e as alocações usadas pelos cenários são explícitas. Nenhuma exceção é adicionada às rotas de produção.

O processo e2e/server.mts sobe a aplicação real sem workers de processamento (NODE_ENV=test); a suíte verifica persistência da solicitação e cancelamento antes do despacho. Workers, ingestão e limites do Analyzer têm testes próprios. Isso mantém os E2E independentes de downloads GitHub e inferência Ollama. Execute no diretório backend: NODE_ENV=test node --import tsx ../e2e/server.mts. O frontend deve encaminhar /api para essa API. No Windows, E2E_CHROME_PATH também aceita o executável do Edge/Chromium.
