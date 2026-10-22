# S2-23 — Relatórios do RepoAnalyzer no acervo

Relatórios concluídos são rascunhos de IA e aguardam aprovação humana. A migration `022_analysis_report_review.sql` exige que PO/admin revise o Markdown e acione **Aprovar relatório e publicar no acervo**. O endpoint `POST /api/v1/projects/{projectId}/repo-analyses/{id}/report/approve` recebe `relatorio_revisao`; uma versão diferente da exibida retorna 409. A aprovação grava revisor, data e SHA-256 e enfileira a indexação na mesma transação. O worker envia apenas o Markdown ao endpoint `/documents/process`, usado pelo pipeline de documentos; não ingere os arquivos brutos do repositório.

Cada trecho inclui proveniência `ai-accepted`, revisor e data. Alterar o relatório ou sua origem invalida o aceite e exige nova aprovação. A busca e o chat verificam a aprovação vigente e identificam a fonte como relatório de IA revisado.

O backfill nunca aprova automaticamente: a migration 022 retira trechos de relatórios legados e deixa seus relatórios aguardando revisão. Não altera os outros tipos de conteúdo do acervo. Desenvolvedores podem ler os relatórios, mas não veem ações de aprovação/reprocessamento. Projetos arquivados e relatórios sem aprovação recusam a publicação.

Cada trecho preserva projeto, análise, execução, URL, commit/ref quando disponíveis, caminhos citados no próprio trecho e SHA-256 do relatório. O Analyzer registra a revisão Git do clone e preserva esses dados nos checkpoints. Relatórios antigos sem revisão conhecida mantêm valores nulos; a implementação não inventa essa informação.

A persistência substitui os trechos da mesma análise em transação. Uma alteração do relatório ou de sua origem invalida a reserva anterior e remove imediatamente os trechos antigos. O arquivamento do projeto também remove os trechos e bloqueia a gravação de respostas atrasadas.

Falhas fazem até cinco tentativas com espera progressiva. PO e administrador podem usar **Reprocessar relatório** no Analyzer ou `POST /api/v1/projects/{projectId}/repo-analyses/{id}/indexing/retry`. Chamadas repetidas enquanto o processamento está pendente ou em andamento preservam a reserva atual. Projetos arquivados recusam a operação.

A busca aceita o nível `analise_repositorio` e abre `/projects/{projectId}#repo-analyzer={analysisId}`, selecionando a análise citada. Fontes do chat identificam o repositório e a execução. Mensagens técnicas persistidas pelo worker são códigos controlados, sem corpo HTTP, prompt ou credenciais.

## Validação

- `npm test --prefix backend` e `npm test --prefix frontend`: contratos, escopo da resposta da IA, navegação, permissões e recuperação pela interface.
- `npm run test:integration:indexing --prefix backend`: banco isolado, agendamento transacional, idempotência, revisão, reservas expiradas, falhas recuperáveis, arquivamento e isolamento.
- Em `backend/`, `npm run test:integration:harness`: FastAPI real, processamento de Markdown, PostgreSQL, busca e fontes do chat; respostas do Ollama são simuladas.
- `python -m unittest discover -s tests`, em `ai-service/`: Analyzer, checkpoints e processamento de documentos.

A qualidade semântica do relatório e dos embeddings do modelo instalado deve ser conferida com o Ollama local; respostas simuladas validam o fluxo e os contratos.
