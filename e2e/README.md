# Testes End-to-End (E2E) — Sinapse

Este diretório contém a suíte de testes de ponta a ponta (E2E) automatizados no navegador para o Sinapse, utilizando `playwright-core` e `axe-core` (auditoria de acessibilidade).

## 📋 Pré-requisitos

1. **Serviços em execução:**
   - Frontend em `http://localhost:5173`
   - Backend em `http://localhost:3001`
   - PostgreSQL com migrations aplicadas
   - Serviço de IA (para fluxos de busca semântica/RAG e chat)
2. **Navegador instalado:** Google Chrome ou Chromium compatível no sistema.

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
