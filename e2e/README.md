# Testes E2E (navegador + API real + PostgreSQL)

Cobrem os fluxos autenticados de ponta a ponta com o backend real, o PostgreSQL e o frontend no Chrome.
Não substituem os testes de unidade de cada módulo.

## Pré-requisitos

- PostgreSQL com todas as migrations aplicadas (`cd backend && npm run migrate`).
- Backend em `http://localhost:3001` (`cd backend && npm run dev`) com `DOCUMENT_STORAGE_DIR` gravável.
- Frontend em `http://localhost:5173` (`cd frontend && npm run dev`).
- Google Chrome instalado (ou `E2E_CHROME_PATH` apontando para um executável Chromium).
- O serviço de IA **não** é necessário: os testes verificam o comportamento quando ele está indisponível.
- Opcional: `E2E_ADMIN_EMAIL` e `E2E_ADMIN_PASSWORD` para os cenários de administrador (o cadastro público não cria admin).

## Execução

```bash
cd e2e
npm ci
npm test                     # todos os cenários
node --test tests/documents.e2e.mjs
```

Variáveis: `E2E_API_URL`, `E2E_APP_URL`, `E2E_CHROME_PATH`, `E2E_TIMEOUT_MS`.

Cada cenário cria usuários e projetos próprios (nomes únicos), então pode rodar repetidamente no mesmo banco de desenvolvimento.
Use um banco descartável em ambientes compartilhados.
