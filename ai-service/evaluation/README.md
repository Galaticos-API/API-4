# Avaliação da busca do acervo

Esta pasta contém as baterias versionadas da S2-17, um executor HTTP e um avaliador independente do mecanismo de busca. A v1 é a referência imutável; a v2 adiciona metadados de localizador e duas consultas por conteúdo para comparar os dois jeitos de busca.

## Privacidade e corpus

O corpus usa recortes de documentação pública dos projetos API-1, API-2 e API-3. A política PRE-06 exclui código-fonte, configuração de IDE e anexos de teste; o repositório API-2 contém anexos de teste com dados pessoais. Esta suíte não coleta nem armazena esses anexos, nomes de autores ou dados pessoais. Consulte `database/seed/fixtures/historical-v1.json`, `database/seed/fixtures/historical-v2.json` e `docs/backlog/README.md` para a origem e as transformações documentadas.

## Dataset

`datasets/search-ptbr-v1.json` contém 24 consultas em português brasileiro, IDs estáveis, categoria, projeto obrigatório, filtros opcionais e IDs das evidências relevantes. Inclui paráfrases semânticas, identificadores/termos exatos, consultas com intenção combinada, consultas sem evidência, filtros de nível e casos de escopo de projeto para detectar vazamento.

`datasets/search-ptbr-v2.json` preserva as 24 consultas e gabaritos da v1, aponta para a fixture `pre06-historical-v2` com IDs próprios, e acrescenta duas consultas de conteúdo sobre os requisitos GRF. As consultas `GRF-01` e `GRF-08` continuam na categoria de identificadores exatos. Assim medimos tanto a busca por código quanto pela descrição do que a funcionalidade faz.

Os IDs de evidência correspondem aos IDs de `chunk` da fixture PRE-06. Toda consulta escolhe explicitamente um projeto, em linha com a regra de que distância semântica não concede acesso entre projetos. A consulta é julgada somente contra o escopo indicado; o avaliador também acusa qualquer resultado retornado de outro projeto.

## Formato normalizado de resultados

O executor `run_search_suite.py` converte a resposta da rota S2-06 para este formato. Cada consulta precisa aparecer exatamente uma vez; `results` mantém a ordem de ranking e os scores que a API fornecer.

```json
{
  "dataset": "sinapse-search-ptbr",
  "version": 1,
  "runs": [
    {
      "query_id": "Q001",
      "latency_ms": 145,
      "results": [
        {
          "source_id": "60000000-0000-4000-8000-000000000003",
          "project_id": "60000000-0000-4000-8000-000000000001"
        }
      ]
    }
  ]
}
```

`source_id` deve ser o identificador do chunk/evidência recuperada e `project_id` deve ser o projeto retornado junto à fonte. O avaliador compara o escopo retornado com o projeto pedido e, quando a fonte pertence ao corpus PRE-06, também verifica contra o manifesto curado. Fontes desconhecidas no corpus podem ser avaliadas como ruído, mas nunca deixam de ser verificadas quanto ao projeto. Não adapte por título ou texto aproximado: isso esconderia erros de identidade e isolamento. O avaliador falha a execução se qualquer resultado estiver fora do projeto consultado; uma violação de isolamento é bloqueadora, não somente uma métrica baixa. O relatório por consulta inclui posição, ID e score retornado para facilitar diagnóstico de falso positivo/falso negativo sem alterar o gabarito.

## Métricas

- `Recall@5` macro: fração das evidências relevantes encontradas entre os cinco primeiros resultados, calculada nas consultas com resposta esperada.
- `Precision@5` macro: relevantes recuperados divididos por cinco nas consultas com resposta esperada; resultados ausentes contam como posições vazias.
- `MRR@5`: média do inverso da posição da primeira evidência relevante, nas consultas com resposta esperada.
- Acurácia de ausência: proporção das consultas sem evidência que retornaram lista vazia.
- Latência: percentis p50/p95 e proporção de consultas abaixo de 2.000 ms, conforme RNF-06 do PRD.
- Isolamento: contagem de resultados cujo `project_id` difere do projeto pedido. O objetivo de segurança é zero violações.
- Métricas por categoria: repetem recuperação, acurácia sem evidência e p95 para cada tipo de consulta, permitindo localizar regressões que uma média global esconde.
- Filtros de nível e tecnologia são enviados pelo executor quando declarados na consulta. A fixture PRE-06 não contém associações de tecnologia curadas; por isso a avaliação quantitativa de tecnologia requer um corpus/fixture versionado com tags revisadas, enquanto o filtro combinado já é coberto por teste PostgreSQL de integração.

O backlog não define um mínimo de Recall/Precision/MRR. Portanto, o relatório mede e registra a linha de base, sem inventar um critério de aprovação. O time/PO deve definir metas de relevância depois de observar a busca real. Para latência, RNF-06 exige menos de 2.000 ms por consulta; exatamente 2.000 ms não passa. Reporte ambiente, hardware, concorrência e se houve aquecimento do Ollama para que comparações sejam reproduzíveis.

## Executar

### Execução isolada e reproduzível

Há um orquestrador que cria PostgreSQL/pgvector e FastAPI temporários, aplica a fixture PRE-06,
gera os embeddings com o Ollama local, cria uma sessão exclusivamente de QA e executa a API real.
Ao terminar, inclusive em caso de erro, tenta encerrar todos os recursos; uma falha na
limpeza de um deles não interrompe as demais tentativas e produz saída de erro.

Pré-requisitos: Docker, Python 3.11+, Ollama com `bge-m3` disponível na porta 11434 e imagem
`sinapse-s209-ai-test` construída a partir de `ai-service`. Validado em Windows/Docker Desktop.
Em Linux, o Ollama precisa aceitar conexões pelo gateway local usado pelo contêiner.

```bash
# Na raiz, uma vez ou após alterar as dependências Python:
docker build -t sinapse-s209-ai-test ai-service

# Em backend:
npm run evaluate:search -- --python python --version 2 --rounds 3
```

Se o Windows resolver `python` para o atalho da Store, informe em `--python` o caminho do
executável instalado. `SEARCH_PYTHON` também define esse caminho. `--version 1` seleciona a
bateria original; nenhuma execução modifica fixtures ou gabaritos.

A saída padrão fica em `ai-service/evaluation/results/s217-<SHA>`, ignorada pelo Git; use
`--output` para preservar rodadas separadas. Cada rodada grava resultados e métricas.
`environment.json` registra hardware, runtimes, modelo/digest, imagem de IA, aquecimento e
concorrência. `summary.json` separa os gates de isolamento, latência e aceite de relevância.
O processo retorna erro se qualquer consulta atingir ou ultrapassar 2.000 ms. Violação de isolamento
é recusada pelo avaliador, inclusive depois da quinta posição. Um retorno zero não é aceite
de relevância: o backlog não define o mínimo de Recall/Precision/MRR.

O preparo gera seis vetores do texto curado e marca os documentos dessa base descartável
como processados. Isso prepara a medição de recuperação; não é teste do upload/extração S2-01/S2-02.
Uma consulta de aquecimento fica fora da medição, e as rodadas usam concorrência 1.
Não compare números de ambientes diferentes como se fossem uma melhoria da implementação.

Os testes unitários do avaliador e do adaptador HTTP são executados no CI, sem Docker ou Ollama.
Uma avaliação com modelo real permanece execução explícita, pois requer o runtime local.
O registro da reexecução sobre a API `9936354` está em
[QA-S2-17-2026-10-25](../../docs/QA-S2-17-2026-10-25.md).

O diretório padrão inclui versão, data e identificador da execução. Um `--output` que já
exista é recusado, preservando as evidências anteriores; use uma pasta nova a cada execução.
O executor confere o dataset e seu corpus antes de criar recursos. O cliente HTTP recusa
redirecionamentos para que a sessão não seja encaminhada a outro destino. O avaliador
confere o nível da fonte e o filtro de nível; resultados antigos sem `entity_type` podem
usar o manifesto curado como referência. Fontes desconhecidas em consultas filtradas precisam
informar o nível. Os resultados da API atual incluem esse campo.

Os hashes do dataset são capturados antes das consultas. Um dataset em memória sem arquivo
correspondente recebe hash do JSON canônico, identificado por `dataset_hash_kind`.
O avaliador verifica o hash quando presente; resultados históricos sem metadados continuam
compatíveis. Alterações de dataset ou fontes durante a medição invalidam a execução quando
há hashes verificáveis. Veja a [revisão complementar](../../docs/QA-S2-17-REVISAO-2026-10-25.md).

### Correção de relevância e diagnóstico suplementar

As quatro falhas suplementares foram tratadas depois da revisão complementar. A execução
mais recente está em [QA-S2-17-QUATRO-CONSULTAS-2026-10-25](../../docs/QA-S2-17-QUATRO-CONSULTAS-2026-10-25.md).
`search-diagnostics-draft-v2.json` preserva as 40 consultas suplementares anteriores e
acrescenta oito negativas para verificar ambiguidades dos conceitos. As versões publicadas
`search-ptbr-v1/v2.json` e suas fixtures permanecem inalteradas.

A recuperação parcial exige pelo menos dois conceitos compartilhados que ajudem a
distinguir a fonte dentro do projeto. Termos presentes em todos os chunks do projeto não
sustentam essa etapa quando há mais de um chunk. O vocabulário versionado de autenticação,
papéis de gestão, restrição e inativação está em `backend/src/modules/search/search.concepts.ts`.
Conjugações com alternância c/qu e g/gu são normalizadas depois do stemming. Repetições e
sinônimos do mesmo conceito contam uma única vez. Os cortes independentes são
`SEARCH_MIN_PARTIAL_SIMILARITY=0.5` e `SEARCH_MIN_CONCEPT_SIMILARITY=0.45`.
Esse caminho também passa pelos filtros de projeto, acesso, nível e elegibilidade da origem.
O relatório registra a versão do vocabulário e os dois cortes adicionais.

A reexecução após corrigir a recuperação está em
[QA-S2-17-CORRECOES-2026-10-25](../../docs/QA-S2-17-CORRECOES-2026-10-25.md).
A busca mantém o corte vetorial de 0,55 e o rank textual de 0,05. Candidatos sem
correspondência textual integral passam por uma combinação de similaridade e cobertura
dos termos (`SEARCH_MIN_HYBRID_SCORE`, padrão 0,45), preservando correspondências semânticas
fortes (`SEARCH_STRONG_VECTOR_SIMILARITY`, padrão 0,6). Quando nenhum candidato apresenta
apoio textual, permanece o fallback semântico original. Siglas em maiúsculas podem
corresponder às iniciais da expressão completa; números de 0 a 20 também são comparados
por extenso. Não há dicionário específico de respostas, siglas ou IDs do gabarito.

`search-diagnostics-draft-v1.json` preserva as 26 perguntas da v2 e acrescenta 14 propostas
de diagnóstico. Seu gabarito suplementar ainda requer revisão do PO/time. Foi usado no
desenvolvimento do ajuste; não representa avaliação cega nem substitui a v2 publicada.
Para executar o diagnóstico sobre a fixture v2, dentro de `backend`:

```bash
npm run evaluate:search -- --version 2 --rounds 1 --dataset ../ai-service/evaluation/datasets/search-diagnostics-draft-v1.json --output ../ai-service/evaluation/results/diagnostics
npm run test:integration:search
```

Use `--python caminho/do/python` caso o executável não se chame `python`. `--diagnostics`
registra os sinais de similaridade e cobertura em `diagnostics.json`, sem consultar outros
projetos. O ambiente registra as quatro configurações efetivas da busca, além das versões
independentes do corpus e do dataset. O teste de banco cobre sinais de relevância com vetores
determinísticos e verifica autorização, isolamento, arquivamento e documento não processado.

Executar as 24 consultas contra o backend local (a sessão deve ter acesso ao projeto de cada consulta):

```bash
export SINAPSE_SESSION_COOKIE="<cookie de sessão>"
python ai-service/evaluation/run_search_suite.py --output ai-service/evaluation/results/search-ptbr-v1-results.json
python ai-service/evaluation/evaluate_search.py --results ai-service/evaluation/results/search-ptbr-v1-results.json
```

Para executar a v2, passe o dataset e grave resultados em local descartável; substitua o caminho de saída conforme sua política de retenção:

```bash
python ai-service/evaluation/run_search_suite.py --dataset ai-service/evaluation/datasets/search-ptbr-v2.json --output tmp/search-ptbr-v2-results.json
python ai-service/evaluation/evaluate_search.py --dataset ai-service/evaluation/datasets/search-ptbr-v2.json --results tmp/search-ptbr-v2-results.json
```

O executor lê a credencial de `SINAPSE_SESSION_COOKIE`, envia `projeto_id` em toda chamada, cronometra a latência HTTP real, e não imprime nem grava a credencial. `SINAPSE_API_BASE_URL` altera a URL base (padrão `http://localhost:3001`), mas por segurança só aceita HTTP em `localhost` ou endereço loopback; cookies de sessão nunca são enviados para hosts remotos. O executor registra SHA do commit, se o working tree estava modificado, hash do snapshot de arquivos versionados/não ignorados, hash do dataset e do arquivo de corpus. `.env*` e `tmp/` ficam fora do hash e do relatório. O arquivo de resultados não deve ser commitado quando incluir nomes, conteúdo ou outros dados que não sejam da fixture aprovada.

Também é possível fornecer resultados normalizados de outro executor:

```bash
python ai-service/evaluation/evaluate_search.py --results caminho/para/resultados.json
```

Por padrão calcula métricas em `k=5` e orçamento de 2.000 ms. Os parâmetros `--k`, `--latency-budget-ms` e `--dataset` permitem reproduzir outra execução sem alterar o dataset versionado. A ferramenta retorna código 2 para arquivos, versões, consultas ou resultados inválidos.

Testar o avaliador sem Ollama, Postgres ou endpoint S2-06:

```bash
python -m unittest discover -s ai-service/tests -p "test_search*.py"
```

Com Postgres descartável que já tenha pgvector instalado e banco terminado em `_test`, o teste S2-06 de integração pode ser executado dentro de `backend` após definir `HYBRID_SEARCH_TEST_DATABASE_URL`:

```bash
npm run test:integration:search
```

## Baseline ponta a ponta executada; aceite de relevância pendente

Em 02/10/2026 o executor rodou as 24 consultas contra API, PostgreSQL/pgvector e Ollama locais, usando embeddings da fixture PRE-06. A execução e a comparação de corte foram feitas em banco descartável; veja números, limitações e plano de ação no [registro da revisão QA](../../docs/STATUS_REVISAO_2026-10-02.md).

Na execução inicial da v1, `SEARCH_MIN_VECTOR_SIMILARITY=0.3` obteve Recall@5 de 88,9%, acurácia de ausência de 16,7%, p95 de 145 ms e zero violações de isolamento. O experimento v1 com `0.6` elevou a acurácia de ausência para 100%, mas baixou Recall@5 para 72,2%. Esses números são referências históricas da v1; os resultados atuais da v2 e a matriz de cortes estão no [relatório da avaliação](../../docs/QA_SEARCH_V2_2026-10-02.md). `0.55` foi escolhido como padrão local provisório, pendente de reavaliação com corpus maior e metas formais de relevância.

Queries com formato de identificador (`GRF-01`) usam correspondência literal sobre `metadata.source_locator` e não recebem fallback semântico quando não há correspondência. O avaliador também rejeita qualquer resultado fora do projeto solicitado. A v2 com identificadores e perguntas de conteúdo foi executada ponta a ponta; `0.55` é o padrão local provisório escolhido pelo usuário, ainda sem aceite final das metas de qualidade. Diagnóstico da avaliação v2 e limitações remanescentes estão no [relatório QA](../../docs/QA_SEARCH_V2_2026-10-02.md). O runner atual exige URL local, registra hashes de proveniência e o avaliador mostra o ranking por consulta. Após qualquer mudança no runner, corpus, configuração ou busca, reexecute a bateria real contra a API e preserve apenas relatório sanitizado.

Não modifique silenciosamente versão publicada do corpus ou gabarito. Alterações exigem revisão e nova versão do dataset/corpus.
