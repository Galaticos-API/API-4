# PRE-04 — Fundação de testes

Os três serviços possuem suítes determinísticas executadas pela CI em
`.github/workflows/ci.yml`. Esta fundação não implementa funcionalidades pendentes
dos PBIs e não substitui testes ponta a ponta com serviços reais.

## Execução local

Use Node.js 20 e Python 3.11, as mesmas versões configuradas na CI.
Execute cada grupo no diretório indicado:

| Diretório | Instalação | Testes | Compilação |
| --- | --- | --- | --- |
| `backend` | `npm ci` | `npm test` | `npm run build` |
| `frontend` | `npm ci` | `npm test` | `npm run build` |
| `ai-service` | `python -m pip install -r requirements.txt` | `python -m unittest discover -s tests -v` | `python -m py_compile main.py config.py services/__init__.py services/chunker.py services/ollama_client.py` |

Para Python, recomenda-se um ambiente virtual local (`python -m venv .venv`).
Ative-o antes de instalar dependências e executar os comandos.

## Cobertura inicial

- Backend: testes de configuração, autenticação, autorização, seed e projetos, incluindo regras de
  negócio e HTTP com repositório em memória. `scripts/test.mjs` descobre arquivos
  `src/**/*.test.ts` recursivamente sem depender da expansão de globs do shell.
  Nenhum arquivo encontrado ou falha em qualquer teste retorna código diferente de zero.
- Frontend: Vitest, Testing Library e jsdom; autenticação, projetos, navegação e ações explícitas sobre sugestões de IA,
  botão desabilitado, erro acessível de formulário e limites do indicador de progresso.
  Novos arquivos `*.test.ts`/`*.test.tsx` são descobertos pelo Vitest. O comando não
  permanece em modo watch e falha se não encontrar testes.
- IA: testes existentes de chunking/metadados e novos testes HTTP de validação,
  embeddings, contexto RAG e indisponibilidade do Ollama. Chamadas ao cliente de
  modelos usam `AsyncMock`; não exigem GPU, Ollama, banco ou conexão externa.

Dados de teste são sintéticos. Não adicionar tokens, senhas reais, documentos de
clientes, dumps de ambiente ou respostas privadas aos testes e logs.

## Integração contínua

Os jobs do backend, frontend e IA executam os mesmos comandos acima em pull requests
para `main`, `HT-setup` e `develop`, e em pushes nessas branches. O workflow também
permite execução manual (`workflow_dispatch`). Um comando de teste com falha reprova
seu job; não há `continue-on-error` nem tolerância automática por repetição.
Os checks existentes de n8n, Docker Compose e auditoria do backend foram mantidos.

## Limites e conclusão

Após integrar a main em 16/09/2026, a validação local em Windows passou com
52 testes de backend (1 teste de PostgreSQL ignorado localmente), 50 de frontend
e 9 de IA. Os builds TypeScript/Vite e a compilação Python passaram. A auditoria
das dependências de produção do backend não encontrou vulnerabilidades.
O teste de banco exige SEED_TEST_DATABASE_URL e é executado no job
validate-seed com PostgreSQL/pgvector; não deve ser contado como aprovado localmente.
A CI usa Node.js 20/Python 3.11; a validação local usa Node.js 22/Python 3.12.

Os PBIs referenciados orientam a expansão da suíte: completude, busca semântica,
respostas fundamentadas e autenticação. A fundação não comprova que esses PBIs estão
concluídos. Em particular, os testes RAG verificam o transporte do contexto, não a
qualidade factual de um modelo real. Os testes de autenticação e projetos já integrados à main foram preservados,
assim como os scripts de seed e test:integration:s1.

Nenhum endpoint foi alterado; não há alteração de OpenAPI nesta tarefa.
Para encerrar a PRE-04, confirmar uma execução remota verde dos três jobs no PR e
obter revisão por outra pessoa. Tornar os checks obrigatórios para merge depende
das regras de proteção da branch no GitHub, que não são alteradas por este commit.
