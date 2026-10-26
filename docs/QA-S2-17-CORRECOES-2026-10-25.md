# S2-17 — correção e reavaliação de relevância

Esta execução foi seguida por uma [revisão complementar](QA-S2-17-REVISAO-2026-10-25.md),
com correções adicionais, cobertura ampliada e novas medições. Os números abaixo preservam
a execução anterior; não substituem os resultados mais recentes.

25/10/2026, America/Sao_Paulo. Base Git: `9936354fa6c609836012381f7e399f218529a4f8`,
com alterações locais no mecanismo de busca e no executor. Esta execução não corresponde
à main sem modificações. Não houve commit, envio ou aceite de produto.

## Problemas corrigidos

- Q008: a consulta com sigla PDI não recuperava a expressão completa da fonte. A busca
  compara iniciais de palavras relevantes, sem cadastrar equivalências específicas do corpus.
- Q022: uma palavra genérica compartilhada permitia um resultado de assunto diferente.
  A aceitação combina similaridade e cobertura textual para candidatos sem correspondência integral.
- Q006/Q025: fontes adicionais fora do gabarito eram aceitas somente pelo corte vetorial.
  O mesmo filtro combinado removeu essas fontes, preservando a fonte correta.
- Proveniência do executor: `started_at` antecede as consultas e `finished_at` marca seu término;
  versões de corpus e dataset suplementar são registradas separadamente, com configuração efetiva.
- A suíte do avaliador agora é descoberta pelo unittest e tem etapa própria no workflow de CI.

O corte vetorial permanece 0,55 e o rank textual mínimo, 0,05. Os padrões novos são
`SEARCH_MIN_HYBRID_SCORE=0.45` e `SEARCH_STRONG_VECTOR_SIMILARITY=0.6`, documentados no
`.env.example`. Correspondência textual integral, identificadores exatos e recuperação
puramente semântica sem qualquer apoio lexical continuam disponíveis. Números de 0 a 20
também são reconhecidos por extenso. O mecanismo não contém IDs, siglas ou respostas do gabarito.

## Bateria publicada v2

Backend e sessão HTTP reais, PostgreSQL/pgvector e FastAPI descartáveis, Ollama local com
`bge-m3:latest`, seis chunks da PRE-06, três projetos. Os datasets v1/v2 e as fixtures
publicadas foram preservados byte a byte. Uma consulta de aquecimento fora das métricas;
concorrência de consultas 1. Parte da execução ocorreu junto da suíte de banco no mesmo
host; os tempos representam esse ambiente local, sem ensaio de carga.

| Rodada | p50 | p95 | Máximo | Em até 2.000 ms | Violações de projeto |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 104 ms | 171 ms | 182 ms | 26/26 | 0 |
| 2 | 104 ms | 142 ms | 148 ms | 26/26 | 0 |
| 3 | 120 ms | 164 ms | 198 ms | 26/26 | 0 |

Em cada rodada: Recall@5 **100%**, MRR@5 **100%**, acurácia de ausência **100% (6/6)**,
nenhuma fonte adicional fora do gabarito. Foram 78 consultas medidas.
Precision@5 macro é **20%**: o avaliador divide por cinco posições e cada consulta
positiva tem uma única fonte esperada. Isso equivale ao máximo possível desta fixture,
não a 80% de respostas incorretas.

Comparação com a [linha de base](QA-S2-17-2026-10-25.md): Recall/MRR passaram de 95% para
100%, ausência de 5/6 para 6/6; saídas adicionais de Q006/Q025 deixaram de ocorrer.
Identificadores GRF-01/GRF-08 e suas consultas por conteúdo continuaram corretos.

## Diagnóstico suplementar e limitações conhecidas

O arquivo `search-diagnostics-draft-v1.json` combina as 26 consultas preservadas com
14 paráfrases/negativas propostas para diagnóstico. Não é benchmark independente:
foi consultado durante o desenvolvimento e ainda exige curadoria do PO/time.

| Resultado nas 40 consultas | Antes | Depois |
| --- | ---: | ---: |
| Positivas com fonte recuperada | 26/31 | 27/31 |
| Negativas corretamente vazias | 8/9 | 9/9 |
| Consultas com fontes adicionais fora do gabarito | 3 | 0 |
| Consultas com violação de projeto | 0 | 0 |
| Consultas em até 2.000 ms | 40/40 | 40/40 |

O primeiro protótipo foi rejeitado: removia ruído, mas regredia H005/H007/H014. O ajuste
final recupera esses três casos e mantém todas as consultas anteriormente recuperadas.
A execução final suplementar teve p50 111 ms e p95 129 ms.

Persistem quatro falhas de recuperação nessa proposta de gabarito, todas já presentes
antes do ajuste; não estão resolvidas:

- H001: “De que maneira a chefia consegue entrar na área restrita?” — fonte 003 (API-1).
- H002: responsáveis se identificarem antes de usar os recursos — fonte 003 (API-1).
- H006: desabilitar cadastro sem apagar dados — fonte 008 (API-2).
- H009: evolução do crédito em todo o Brasil — fonte 013 (API-3).

As similaridades medidas dessas fontes ficaram abaixo do corte vetorial e a recuperação
textual não forneceu correspondência suficiente. Uma melhoria adicional requer avaliar
recall/ruído em corpus maior e revisar essas expectativas. O corpus de seis chunks não
demonstra qualidade geral nem desempenho em escala. A fixture não possui tags de tecnologia
curadas para medir relevância por tecnologia; isso continua pendente.

## Verificação automatizada

- Backend: **86 passaram**, 26 condicionais ignorados na suíte geral; typecheck e build passaram.
- PostgreSQL/pgvector, executor de indexação: **99 passaram**, um teste opcional de IA real ignorado.
- Busca/acesso, execução focada: **17 passaram**; estão também dentro dos 99 acima.
- Qualidade/RAG no PostgreSQL: **30 passaram**, um teste opcional de síntese com IA real ignorado.
- Avaliador/adaptador HTTP: **19 passaram** em Python 3.13 no host e Python 3.11 em contêiner.
- Typecheck estrito do executor e validação de whitespace passaram.

Os novos testes de banco usam outros exemplos, vetores determinísticos e não dependem do
Ollama. Cobrem sigla/expressão completa nos dois sentidos, números por extenso, ruído lexical,
paráfrases semânticas, texto sem embedding, identificador inexistente, autorização e escopo,
documento com falha e projeto arquivado. O teste de autenticação preexistente foi reexecutado.

Durante o preparo dos testes novos, a fixture de projeto foi corrigida para incluir cliente
e nomes únicos; não eram falhas da aplicação. A primeira execução da suíte geral falhou em
`uv_os_get_passwd` no ambiente restrito; a repetição fora dessa restrição passou. Nenhum
teste com falha permaneceu na execução final. Os testes opcionais ignorados não são declarados
como executados. Não houve mudança de frontend.

## Reprodução e evidência

No diretório `backend`, com Docker, imagem `sinapse-s209-ai-test`, Python e Ollama disponíveis:

```bash
npm run evaluate:search -- --version 2 --rounds 3 --output ../ai-service/evaluation/results/s217-corrections-final
npm run evaluate:search -- --version 2 --rounds 1 --dataset ../ai-service/evaluation/datasets/search-diagnostics-draft-v1.json --output ../ai-service/evaluation/results/s217-diagnostics-corrected
npm run test:integration:search
npm run test:integration:indexing
npm run test:integration:quality
```

Os JSONs locais ficam nas pastas acima, ignoradas pelo Git. O relatório preserva somente dados
sintéticos/curados e métricas sanitizadas, sem sessão ou senha. Os bancos e contêineres temporários
foram removidos ao final. O banco de desenvolvimento não foi alterado.

Ambiente: Windows x64, i5-12500H, 16 CPUs lógicas, aproximadamente 16 GB RAM,
Node 22.23.0, Python host 3.13.15, Python IA 3.11. Modelo/digest:
`bge-m3:latest` / `7907646426070047a77226ac3e684fbbe8410524f7b4a74d02837e43f2146bab`.
Dataset v2 SHA-256: `fbbf6c44e48663e99ef81cf9d9e57c73c74805f1d87df64dc5105eac92525870`.
Corpus v2 SHA-256: `1da7f65bb73f78670ede7037e50f4396b481a7f25af17350c76b1053b4ed9962`.
Cada resultado registra `working_tree_dirty=true` e o hash da árvore de fontes; não é
evidência de um novo commit publicado. O aceite formal de relevância e a revisão por outra
pessoa continuam pendentes.
