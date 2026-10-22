# S2-23 — Relatórios do RepoAnalyzer no acervo

Ao salvar um relatório concluído, a migration `020_analysis_report_indexing.sql` agenda sua indexação na mesma transação. O worker envia apenas o Markdown ao endpoint `/documents/process`, usado pelo pipeline de documentos; não ingere os arquivos brutos do repositório.

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
