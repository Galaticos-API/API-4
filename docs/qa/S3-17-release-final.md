# S3-17 — Release Final: Regressão Integral, Seed Reproduzível, Backup/Restore e Roteiro de Demonstração

**Data:** 22/11/2026  
**Sprint:** 3 (Fechamento do Semestre 2026/2)  
**PBIs Validados:** `PBI-04.1.1`, `PBI-04.1.2`, `PBI-05.2.1`, `PBI-06.2.1`, `PBI-06.2.2`  
**Dependência:** [S3-16 — Validação de RNFs](S3-16-validacao-rnfs.md)  
**Áreas Envolvidas:** QA, Docs, DevOps

---

## 1. Regressão Integral (Sprints 1 + 2 + 3)

Toda a base de testes automatizados foi executada contra o código integrado da `main` com banco PostgreSQL 16 + `pgvector` real e modelos locais no Ollama (`bge-m3` e `qwen2.5:1.5b`):

| Camada / Suíte | Comando | Total Executado | Resultado |
|---|---|---:|---|
| **Backend — Testes Unitários e Contratos** | `cd backend && npm test` (41 arquivos unitários) | **881 testes** | ✅ 881 passaram, 0 falhas |
| **Backend — Integração PostgreSQL (S1+S2+S3)** | 24 arquivos `*.db.test.ts` + `query-with-deadline.test.ts` | **151 testes** | ✅ 151 passaram, 0 falhas, 0 skips |
| **Backend — Regressões HTTP, Cursores e Unicode** | `cd backend && npm run test:integration:regressions` | **19 baterias** | ✅ 19 aprovadas, 0 falhas |
| **Backend — Typecheck & Build** | `cd backend && npm run typecheck && npm run build` | Build TS completo | ✅ Aprovado (`exit code 0`) |
| **Backend — Validação de Manifesto Seed** | `cd backend && npm run seed:validate` | 15 registros curados | ✅ Aprovado (`exit code 0`) |
| **Frontend — Testes de Componentes e Views** | `cd frontend && npm test` (38 arquivos Vitest) | **316 testes** | ✅ 316 passaram, 0 falhas |
| **Frontend — Build de Produção** | `cd frontend && npm run build` | `tsc -b && vite build` | ✅ Aprovado (`exit code 0`) |
| **AI Service — Testes Unitários Python** | `cd ai-service && python -m unittest discover -s tests -v` | **57 testes** | ✅ 57 passaram, 0 falhas |
| **E2E Navegador (Playwright / Chromium)** | `cd backend && npm run test:integration:review` | **13 fluxos E2E** | ✅ 13 passaram, 0 falhas |
| **Total Geral de Verificações Automatizadas** | — | **1.437 testes** | ✅ **100% Aprovado (0 falhas)** |

---

## 2. Seed Reproduzível (`dev_seed.sql` + `seed-demo-acervos.ps1`)

O ambiente de demonstração é **100% determinístico e reproduzível do zero** em qualquer máquina com Docker Desktop e Ollama:

1. **Inicialização automática (`.\start-dev.ps1`):**
   - Aplica todas as **31 migrations** (`001_initial_schema.sql` a `031_allocations.sql`).
   - Executa automaticamente o seed relacional idempotente (`database/seed/dev_seed.sql`), criando:
     - **3 Contas de demonstração** (senha padrão `Admin@123`):
       - `admin@sinapse.local` (`admin`)
       - `po@sinapse.local` (`po` — PO Daniel Dias)
       - `dev@sinapse.local` (`dev` — Dev Rafael Matesco, alocado na *Plataforma Sinapse*)
     - **8 Tecnologias no vocabulário controlado:** `TypeScript`, `React 19`, `PostgreSQL`, `pgvector`, `Python FastAPI`, `Ollama / Qwen2.5`, `Docker`, `Vite`.
     - **1 Perfil profissional completo** (`Dev Rafael Matesco`, `Senior`) com **3 competências e evidências** e **1 alocação ativa** (`Tech Lead Backend`).
     - **3 Projetos ativos** (`Plataforma Sinapse`, `Portal de Pagamentos PIX`, `Sistema de Autenticação Unificada`) com Épicos, Features, PBIs, Critérios BDD, Relações entre PBIs, Decisões Arquiteturais, Protótipo Figma, Sugestão de IA pendente e Relatório do RepoAnalyzer.
   - Executa automaticamente `.\scripts\seed-demo-acervos.ps1`, que faz upload e vetoriza com `bge-m3` os 3 documentos de acervo de QA (`docs/qa/acervo-demo/*.md`), totalizando **4 documentos processados** e **34 chunks com vetores de 1024 dimensões**.

2. **Validação de Manifesto Curado (`PRE-06`):**
   - `cd backend && npm run seed:validate` valida SHA-256, origem e estrutura dos 15 registros históricos curados (`database/seed/fixtures/historical-v1.json` e `historical-v2.json`).

---

## 3. Procedimento de Backup e Restore Validado

O script automatizado [`scripts/backup-restore-db.ps1`](../../scripts/backup-restore-db.ps1) executa o backup lógico (`pg_dump`), a restauração (`psql`) e a verificação automatizada de paridade em banco isolado:

### Comandos:
```powershell
# 1. Gerar backup e validar restauração em banco temporário (paridade 100%)
.\scripts\backup-restore-db.ps1 -Action verify

# 2. Apenas gerar arquivo de backup (.sinapse-dev\backups\sinapse_backup_release.sql)
.\scripts\backup-restore-db.ps1 -Action backup

# 3. Restaurar backup sobre o banco ativo (em caso de recuperação rápida durante a demo)
.\scripts\backup-restore-db.ps1 -Action restore
```

### Evidência da Execução do Teste de Backup/Restore:
- **Arquivo gerado:** `.sinapse-dev/backups/sinapse_backup_release.sql` (`1.204.774 bytes`, incluindo extensão `vector`, schema das 31 migrations e vetores de 1024 dimensões).
- **Contagens antes do backup (`sinapse`):**
  `projeto=3, epico=3, feature=3, pbi=3, documento=4, chunk=34, desenvolvedor=1, tecnologia=8, competencia=3, alocacao=1`
- **Contagens após restore em banco limpo (`sinapse_restore_verify_test`):**
  `projeto=3, epico=3, feature=3, pbi=3, documento=4, chunk=34, desenvolvedor=1, tecnologia=8, competencia=3, alocacao=1`
- **Resultado:** Paridade 100% verificada e banco temporário removido ao final.

---

## 4. Roteiro e Ensaio da Demonstração ao Cliente (PRO4TECH)

### Pré-Demo (Checklist de 2 minutos antes de apresentar):
1. Confirmar que a stack está ativa: `.\start-dev.ps1 -SkipPull` (ou conferir `http://localhost:5173` e `http://localhost:3001/health`).
2. Gerar um snapshot de backup limpo para recuperação imediata se necessário:
   `.\scripts\backup-restore-db.ps1 -Action backup`
3. Abrir `http://localhost:5173` e autenticar como **Admin** (`admin@sinapse.local` / `Admin@123`) ou **PO** (`po@sinapse.local` / `Admin@123`).

---

### Ato 1 — Estruturação do Backlog, Qualidade Determinística e Exportação Markdown (~3 min)
1. **Navegar em Projetos $\rightarrow$ `Plataforma Sinapse` $\rightarrow$ Backlog:**
   - Mostrar a hierarquia completa no padrão da fábrica: `Projeto` $\rightarrow$ `Épico` $\rightarrow$ `Feature` $\rightarrow$ `PBI` (`PBI-01.1.1`) $\rightarrow$ `Critérios de Aceitação (BDD)`.
   - Destacar o **Score de Completude (100%)** calculado deterministicamente (verbo no infinitivo, história `Como um / Eu quero / Para que`, cenário `Dado / Quando / Então`, ausência de termos vagos e vínculo de protótipo condicional).
   - Mostrar as **Decisões Arquiteturais** registradas com contexto, justificativa e alternativas descartadas, além do **Histórico de Versões** com comparação lado a lado (`S2-16`).
   - Clicar em **Exportar Markdown** (`S3-15` / `PBI-01.5.5`) em um Épico ou Feature para demonstrar a geração imediata do documento padronizado `.md`.

---

### Ato 2 — Copiloto de IA Assistivo e Governança Humana (~2 min)
1. **No editor de PBI (`PBI-01.1.1`):**
   - Mostrar o painel de **Sugestões da IA** (`S2-10` / `S2-13`): a IA atua apenas como copiloto (identificando lacunas, sugerindo cenários BDD e apontando itens similares de outros projetos com indicação da origem).
   - Demonstrar a regra inegociável da PRO4TECH: **nenhuma sugestão da IA altera o banco sozinha** — o PO precisa explicitamente **Aceitar, Editar ou Descartar**, gravando a proveniência (`human-authored`, `ai-accepted`, `ai-edited`).

---

### Ato 3 — Conversa com o Acervo (RAG com Citações, Streaming e Isolamento) (~4 min)
1. **Abrir a aba `Conversa` (`/chat`):**
   - Mostrar o seletor de **Escopo da Consulta** (`Todos os projetos permitidos` ou restrito a um projeto específico) e o badge de **Escopo Ativo** sempre visível (`PBI-04.1.4`).
   - Testar ao vivo as **perguntas homologadas por projeto** (todas com streaming progressivo cancelável `S3-07`, citação clicável `[1]` `PBI-04.1.2` e modal **Fontes e evidências**):
     - **Em `Plataforma Sinapse`:**
       1. `Resuma o projeto Plataforma Sinapse`
       2. `O que precisa existir em um PBI para atender aos critérios de qualidade?`
       3. `Quem trabalhou com TypeScript?` *(demonstra a resposta instantânea sobre a equipe com evidências e projetos — `PBI-05.2.1`)*
     - **Em `Portal de Pagamentos PIX`:**
       1. `Resuma o projeto Portal de Pagamentos PIX`
       2. `Como funciona o cabeçalho Idempotency-Key no envio PIX?`
       3. `Para que servem o Redis e o RabbitMQ no Portal de Pagamentos PIX?`
     - **Em `Sistema de Autenticação Unificada`:**
       1. `Resuma o projeto Sistema de Autenticação Unificada`
       2. `Como funcionam o OpenID Connect e os tokens JWT RS256 no Sistema de Autenticação Unificada?`
       3. `Quais dados são proibidos nos logs de auditoria?`
   - **Demonstrar Recusa Honesta / Zero Alucinação (`PBI-04.1.3`):**
     - Perguntar algo fora do domínio (ex.: `Qual é a previsão do tempo amanhã?`) ou não documentado (ex.: `Qual é a tarifa comercial do PIX?`) e mostrar que o assistente se abstém de inventar fatos e não anexa fontes falsas.

---

### Ato 4 — Mapeamento de Competências da Equipe e Recomendação Explicável (~3 min)
1. **Abrir a aba `Equipe` (`/developers`):**
   - Mostrar o **Perfil Consolidado** de `Dev Rafael Matesco (Senior)` (`PBI-05.1.1` e `PBI-05.1.4`), sem dados pessoais sensíveis (LGPD — `S3-08`).
   - Mostrar as **Competências Técnicas** vinculadas ao vocabulário controlado com nível e evidência (`PBI-05.1.2`), as **Alocações por período/papel** (`PBI-05.1.3`) e o **Histórico Consolidado derivado automaticamente** (`PBI-05.2.3`).
   - Usar a busca **"Quem já trabalhou com..."** (`PBI-05.2.1`) e o painel de **Recomendação de Profissionais** em uma Feature (`PBI-05.2.2`), destacando a justificativa explicável e o caráter estritamente consultivo (sem alocação automática).

---

### Ato 5 — Administração: Perfis de Acesso e Vocabulário Controlado (~2 min)
1. **Abrir `Administração` (`/admin` — exclusivo para `admin`):**
   - **Perfis de Acesso (`PBI-06.2.1` / `S3-13`):** Mostrar a gestão de papéis (`admin`, `po`, `dev`) com registro de autor e data da última alteração e a trava que impede remover/rebaixar o **último administrador ativo**.
   - **Vocabulário de Tecnologias (`PBI-06.2.2` / `S3-14`):** Demonstrar a prevenção de variações de escrita (ex.: tentar cadastrar `Type-Script` ou `NodeJS` quando a forma canônica já existe) e o aviso de impacto com contagem de associações antes de remover uma tecnologia em uso.
   - **Padrão de Qualidade e DoR/DoD (`PBI-01.6.1` / `PBI-01.6.2`):** Mostrar a configuração organizacional versionada de regras e dicionário de termos vagos.
