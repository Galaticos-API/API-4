# Relatório de execução QA — Chat RAG

**Data:** 26/10/2026

**Base revisada:** `main` / `84587ec6489f1c3152916ac5636645988c5ae537`

**Ambiente:** Docker local, PostgreSQL/pgvector, AI Service e Ollama.

## Resumo

Executamos as frentes de observabilidade do RAG, cobertura determinística do chat e medição da recuperação. A suíte de busca existente passou, mas ela não cobre a resposta do chat. O smoke test específico do chat foi criado. Também reproduzimos falsos negativos da busca híbrida em perguntas sobre o documento Aurora; as tentativas de corrigir o ranking causaram regressões em buscas existentes, então não foram mantidas.

## CP0 — Linha de base

- A bateria S2-17 v2 executada nesta rodada passou em **26/26 consultas**, com Recall@5 e MRR@5 de **1,00**, acurácia de ausência de **1,00**, zero violações de isolamento e p95 de **192 ms**. Essa bateria avalia a API de busca, não o fluxo de respostas do chat.
- O documento fictício Aurora foi processado em **13 chunks**.
- Consulta ao código de validação retornou `QA-LARANJA-42` com evidências citadas. A resposta repetiu o fato em dois trechos, pois o documento repete essa informação no resumo e no FAQ.
- O SLA de urgência foi encontrado, mas apareceu em segundo lugar entre dois candidatos.
- A pergunta sobre a decisão de 21 de agosto retornou zero chunks. O chunk pertinente tinha similaridade vetorial `0,45`, cobertura lexical `0,75` e score híbrido estimado `0,57`, acima do limite híbrido `0,45`; mesmo assim não entrou na fusão final porque não passou pelo corte vetorial nem pelo caminho lexical integral.
- A pergunta sobre QA-AUR-08 também não teve recuperação suficiente. Outra consulta real retornou `RAG_UNAVAILABLE`.

## CP1 — Avaliação do chat

Criado `ai-service/evaluation/datasets/chat-rag-smoke-v1.json` com fatos fictícios do Projeto Aurora e variantes de pergunta. Criado `backend/src/modules/chat/rag.qa.test.ts` para testar respostas positivas/paráfrases, abstenção sem evidência, autorização/isolamento e rejeição de citação fabricada.

Os testes usam fakes determinísticos: verificam o contrato RAG e as citações, mas não substituem uma medição do ranking híbrido com PostgreSQL/pgvector e modelo real. Essa limitação está registrada no README da avaliação.

## CP2 — Recuperação híbrida

**Resultado:** sem correção de produção nesta rodada.

Um experimento que adicionava os candidatos de score combinado recuperou a pergunta da decisão, mas criou falso positivo com termos genéricos. Uma restrição por termos distintivos removeu o falso positivo, porém regrediu duas buscas existentes de sigla/conceito. As alterações experimentais foram revertidas; o ranking e os thresholds atuais permanecem intactos.

Próxima ação recomendada: criar avaliação do chat com candidatos gold e diagnósticos por sinal, então calibrar admissão/fusão com consultas de data, valores, siglas, sinônimos, paráfrases e consultas negativas. Não ajustar thresholds com base só no smoke corpus.

## CP3 — Diagnóstico de falhas

O RAG agora cria um ID de diagnóstico e registra etapa controlada, código e duração para falhas de embedding, busca híbrida, contexto, Harness, revalidação de fonte ou montagem da resposta. O Harness compartilha o ID e registra sua própria etapa. Logs não recebem pergunta, contexto, prompt, resposta, SQL ou mensagem bruta de exceção. A API mantém resposta genérica 503; o ID validado é propagado e mostrado pela interface.

O chunker não foi modificado: a evidência aponta primeiro para falsos negativos na recuperação, e alterar chunking exigiria reindexação e nova comparação para atribuir causa.

## CP4 — Verificações

- Backend: **95 passaram, 26 ignorados, 0 falharam**.
- Backend typecheck: passou após alinhar `node_modules` ao lockfile (Zod 3 declarado pelo projeto).
- Frontend: **162 testes passaram**; build passou.
- AI Service: **33 testes passaram**.
- Busca S2-17 v2: **26/26 passaram**; integração de busca do baseline: **26/26 passaram**.
- `git diff --check`: passou.
- RAG real local, em teste de serviço: uma consulta ao código QA respondeu com duas evidências citadas; continua necessário corrigir falsos negativos e validar a jornada visual completa em múltiplas rodadas com o modelo.

## Pendências / limitações

1. O chat ainda pode não recuperar um fato existente; o caso da decisão por data está reproduzido, sem fix seguro aprovado contra regressões.
2. A avaliação automatizada dedicada verifica o contrato RAG com fakes, não a qualidade ponta a ponta do ranking e do LLM.
3. A validação real do chat depende de Ollama e pode variar em latência e saída; deve ser executada com configuração/model digest registrados.
4. O health local está `healthy`, mas informa **2 eventos de remoção pendentes** porque `DOCUMENT_EVENTS_WEBHOOK_URL` não está configurada. Isso é aviso operacional separado da recuperação RAG.
5. `npm ci` reportou 4 vulnerabilidades no backend (1 moderada e 3 altas) e 2 moderadas no frontend; não foram alteradas dependências nesta tarefa.

## Arquivos alterados

- `backend/src/modules/chat/rag.service.ts`
- `backend/src/modules/harness/harness.service.ts`
- `backend/src/modules/chat/chat.service.ts`
- `backend/src/modules/chat/rag.diagnostics.test.ts`
- `backend/src/modules/chat/rag.qa.test.ts`
- `ai-service/evaluation/datasets/chat-rag-smoke-v1.json`
- `ai-service/evaluation/README.md`
- `frontend/src/api/api_chat.ts`
- `frontend/src/api/api_chat.test.ts`
- `frontend/src/views/chat/ChatView.test.tsx`
