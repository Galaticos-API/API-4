# Relatório QA — chat conversacional e recuperação de conhecimento

**Data:** 28/10/2026 (America/Sao_Paulo)  
**Escopo:** melhorias de interpretação de linguagem natural, perguntas de acompanhamento, respostas com evidências, cobertura de perguntas compostas, escopo de consulta e prontidão do acervo.

## Resultado

**QA aprovado para os cenários e o corpus avaliados.** As regressões automatizadas, a integração PostgreSQL/pgvector e o fluxo com os modelos locais passaram. O teste real inicialmente encontrou uma falha: o `qwen2.5:1.5b` classificava como completa uma pergunta composta quando uma parte não tinha evidência. O fluxo foi alterado para decompor perguntas em aspectos, pesquisar e validar cada aspecto separadamente; a repetição com Ollama passou.

O aceite de relevância do produto continua pendente de metas aprovadas pelo PO/time. Recall@5, Precision@5 e MRR foram medidos e registrados, sem inventar limites de aprovação.

## Alterações entregues

- Planejador local interpreta a pergunta, produz até duas variantes de busca e separa até três aspectos factuais. Em perguntas de acompanhamento, recebe somente os últimos turnos concluídos da mesma conversa, limitados a oito mensagens, 1.000 caracteres por mensagem e 4.000 no total.
- Busca híbrida executa as consultas derivadas da pergunta e de cada aspecto. Os resultados são combinados por Reciprocal Rank Fusion, preservando a restrição aos projetos autorizados.
- O RAG seleciona evidências por aspecto. O backend marca a cobertura como completa somente quando cada aspecto tem evidência validada; se apenas alguns tiverem, marca como parcial e informa ao usuário.
- Síntese em linguagem natural recebe somente citações já verificadas. Cada fonte é revalidada depois da geração; em falha de síntese, a resposta usa trechos verificados.
- Respostas distinguem ausência de candidatos, candidatos sem evidência suficiente, cobertura parcial e assunto fora do escopo.
- A lista de projetos informa prontidão do acervo: documentos processados, pendentes ou com falha, trechos elegíveis e embeddings. O aviso é informativo e não bloqueia consulta.
- OpenAPI e documentação do fluxo foram atualizadas para o contrato `rag-conversacional-v1`.

## Validações executadas

| Verificação | Resultado |
|---|---|
| Backend: `npm test` | 166 passaram; 25 testes de banco opcionais foram pulados. Nenhuma falha na suíte executada. |
| Backend: `npm run typecheck` e `npm run build` | Passaram. |
| Frontend: `npm test` | 214 passaram em 20 arquivos. |
| Frontend: `npm run build` | Passou. Bundle principal de 230,46 kB; telas carregadas em chunks separados. |
| Serviço IA: `python -m unittest discover -s tests` | 41 passaram. |
| PostgreSQL/pgvector + FastAPI + Ollama: `rag.db.test.ts` | 12/12 passaram, incluindo pergunta composta parcial, isolamento entre projetos e recusa a pergunta fora do domínio pela busca real. Banco de teste temporário removido ao terminar. |
| Avaliação S2-17: v2, 3 rodadas de 26 perguntas | 78 consultas medidas; resumo em `ai-service/evaluation/results/chat-roadmap-stable-20261028-final/summary.json`. Isolamento: 0 violações; latência: 78/78 abaixo de 2.000 ms; Recall@5 1,00; MRR@5 1,00; acurácia de ausência 1,00; Precision@5 0,20. |
| `git diff --check` e leitura OpenAPI por YAML nos testes | Sem erros de whitespace ou contrato. |

### Leitura das métricas

Na bateria v2, cada pergunta respondível tinha uma fonte esperada. A busca a encontrou em primeiro lugar em todas as consultas (Recall@5 e MRR@5 = 1,00). A métrica Precision@5 divide por cinco posições, mesmo quando há somente um resultado; por isso 0,20 corresponde a uma fonte correta em primeiro lugar e quatro posições vazias, não a falsos positivos medidos. A bateria tem seis chunks curados e serve como regressão; não representa toda a variedade de documentos reais.

## Limites e acompanhamento

- As metas de relevância continuam sem aprovação do PO/time; os valores medidos são linha de base, não aceite formal do produto.
- O teste local usa `qwen2.5:1.5b` e corpus sintético. A classificação por aspecto passou no caso reproduzido, mas novos casos compostos e paráfrases devem ser acrescentados à bateria antes de assumir cobertura geral.
- Uma execução adicional do teste real de indexação (`S2-03/S2-02`) retornou `SERVICE_HTTP_ERROR` ao chamar `/ingest/entity`; isso não pertence ao fluxo conversacional validado acima e deve ser investigado antes de afirmar que a integração de indexação real está aprovada.
- O audit do corpus local encontrou três projetos ativos: um com 10 chunks de documentos e entidades, um com 3 chunks de entidades e um sem documentos ou chunks elegíveis. O estado vazio fica visível pela nova prontidão; é preciso ingerir dados reais para testar esse projeto.
- Nenhuma alteração foi commitada ou enviada ao remoto. O checkout `main` contém outras alterações locais preexistentes, preservadas durante o trabalho.
