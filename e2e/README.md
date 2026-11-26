# Testes End-to-End (E2E) — Sinapse

Este diretório contém a suíte de testes de ponta a ponta (E2E) automatizados no navegador para o Sinapse, utilizando `playwright-core` e `axe-core` (auditoria de acessibilidade).

## 📋 Pré-requisitos

1. **Serviços em execução:**
   - Frontend em `http://localhost:5173`
   - Backend em `http://localhost:3001`
   - PostgreSQL com um banco dedicado chamado `sinapse_e2e_test`, migrations aplicadas e backend conectado a esse mesmo banco
   - Variável `E2E_DATABASE_URL` apontando para `sinapse_e2e_test`, por exemplo `postgresql://sinapse:<senha>@localhost:<porta>/sinapse_e2e_test` (substitua os marcadores conforme seu `.env`)
   - Serviço de IA (para fluxos de busca semântica/RAG e chat)
2. **Navegador instalado:** Google Chrome ou Chromium compatível no sistema.

## 🗃️ Preparar o banco E2E

Com a pilha local iniciada e usando os valores padrão do `.env`, crie o banco dedicado uma vez e aplique o schema e as migrations:

```bash
docker compose exec postgres createdb -U sinapse sinapse_e2e_test
POSTGRES_DB=sinapse_e2e_test npm --prefix backend run migrate
```

Configure o backend para usar `sinapse_e2e_test` também (por exemplo, defina `POSTGRES_DB=sinapse_e2e_test` no `.env` ao usar Docker Compose e reinicie o backend). Exporte `E2E_DATABASE_URL` com as credenciais e a porta correspondentes antes de executar os testes:

```bash
export E2E_DATABASE_URL='postgresql://sinapse:<senha>@localhost:<porta>/sinapse_e2e_test'
```

Os comandos acima usam as credenciais e a porta padrão do projeto; ajuste-os conforme o `.env`. Não use o banco de desenvolvimento compartilhado: a suíte grava e altera dados.

## 🚀 Como executar

Instale as dependências e execute os testes:

```bash
# Na raiz do repositório
npm ci --prefix e2e
npm --prefix e2e test
```

Ou diretamente a partir da pasta `e2e`:

```bash
cd e2e
npm ci
npm test
```

## 🧪 Estrutura da suíte

- `tests/`: Casos de teste automatizados cobrindo os fluxos críticos (autenticação, navegação de projetos, hierarquia de backlog, criação e avaliação determinística de PBIs, busca híbrida, chat com citações e painel de administração).
- `support.mjs`: Utilitários de apoio, setup de autenticação de teste e validações de acessibilidade (`axe-core`).
- `database.mjs`: Auxiliares de consulta e estado descartável para testes integrados.
