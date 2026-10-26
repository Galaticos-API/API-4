# S2-17 — correção das quatro consultas suplementares

25/10/2026, America/Sao_Paulo. Código local sobre `9936354`, sem commit ou envio.
Este relatório sucede a revisão complementar, preservando os registros anteriores.

## Resultado

As quatro consultas recuperaram as fontes esperadas nas três rodadas finais:

| Consulta | Origem recuperada | Resultado |
| --- | --- | --- |
| H001 — chefia entrando em área restrita | API-1, chunk 003: login de administradores e restrição de funcionalidades | Passou 3/3 |
| H002 — responsáveis se identificarem para usar recursos | API-1, chunk 003 | Passou 3/3 |
| H006 — desabilitar cadastro sem apagar dados | API-2, chunk 008: cadastro, consulta, edição e inativação de usuários pelo RH | Passou 3/3 |
| H009 — séries da evolução do crédito no Brasil | API-3, chunk 013: saldo nacional de crédito e séries 20539/20540/20541 | Passou 3/3 |

Os sufixos de chunk acima pertencem ao namespace `62000000-0000-4000-8000-000000000`.
A recuperação de H006 não acrescenta afirmações à fonte: o trecho cita inativação; o RAG
continua limitado às evidências presentes no documento.

## Ajuste implementado

A busca ganhou uma etapa de correspondência parcial por conceitos. Ela exige dois
conceitos distintos que ajudem a identificar a fonte dentro do projeto, mais apoio semântico.
Termos repetidos ou equivalentes contam uma única vez; termos comuns a todos os chunks do
projeto não sustentam essa etapa quando existe mais de um chunk.

O vocabulário versão 1 cobre autenticação, papéis de gestão, restrição e inativação.
Ele está em `backend/src/modules/search/search.concepts.ts`. A normalização de conjugação
c/qu e g/gu permite relacionar formas como “identifiquem” e “identificar”. Os cortes padrão
são 0,50 para correspondência parcial e 0,45 quando há equivalência do vocabulário. Eles
são configuráveis independentemente do corte de candidatos exclusivamente vetoriais.

A elegibilidade parcial é calculada antes do limite de candidatos. Projeto, autorização,
origem processada/aprovada, arquivamento, nível e demais filtros são aplicados antes dessa etapa.
Os identificadores literais continuam exigindo a origem exata. Não houve alteração no
corpus, nos textos das fontes ou nos gabaritos anteriores para produzir esse resultado.

## Controle de regressões e ambiguidades

O diagnóstico v2 mantém todas as 40 consultas anteriores e acrescenta oito negativas:
notificações push, cobrança de assinaturas, receitas médicas, saque em cartão, prontuários,
faturamento em séries, limpeza de arquivos e entrada de veículos.

O primeiro protótipo recuperou as quatro fontes, mas confundiu entrada de veículos com
login. Esse resultado foi rejeitado. Termos genéricos de entrada foram retirados do conceito
de autenticação; a correspondência de chefia passou a usar papéis de gestão e restrição.
Foram acrescentados testes para entrada física, repetição de sinônimos, um único conceito,
termos comuns ao projeto e respeito aos cortes configurados.

Os testes usam também exemplos de operadores, cadastro funcional e consumo hídrico, com
vetores determinísticos. Não dependem dos IDs ou da redação das quatro consultas.

## Execução final com modelo real

Dataset `search-diagnostics-draft-v2.json`, 48 consultas por rodada: as 26 publicadas,
14 do diagnóstico anterior e oito negativas adicionais. PostgreSQL/pgvector e FastAPI
descartáveis, API autenticada e embeddings `bge-m3` reais. Aquecimento excluído das métricas,
concorrência de consultas 1, demais suítes encerradas durante a medição final.

| Rodada | Consultas | p50 | p95 | Máximo | Abaixo de 2.000 ms | Violações de projeto |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 48 | 115 ms | 157 ms | 255 ms | 48/48 | 0 |
| 2 | 48 | 117 ms | 164 ms | 172 ms | 48/48 | 0 |
| 3 | 48 | 103 ms | 138 ms | 156 ms | 48/48 | 0 |

Em cada rodada: **31/31 positivas** recuperadas, **17/17 negativas** vazias, Recall@5 e
MRR@5 de 100%, nenhuma fonte adicional fora do gabarito. Precision@5 é 20%, o máximo
dessa fixture com uma fonte relevante esperada por consulta e cinco posições no denominador.
Foram **144 consultas medidas** e nenhuma ultrapassou o limite.

Arquivos locais: `ai-service/evaluation/results/s217-four-cases-validated-20261025/`.
Cada execução registra modelo/digest, ambiente, configuração, versão do vocabulário e
hash da árvore modificada. A revisão não corresponde à main sem alterações.

## Testes automatizados

- Backend: 86 passaram; 26 condicionais ignorados na suíte geral.
- PostgreSQL/pgvector, indexação e regressões relacionadas: 108 passaram; um teste opcional de IA real ignorado.
- Qualidade/RAG no PostgreSQL: 30 passaram; um teste opcional de síntese com IA real ignorado.
- Avaliador/cliente HTTP Python: 33 passaram no host 3.13 e no contêiner 3.11.
- Typecheck, build e checagem estrita do executor: passaram.
- Teste de integridade: as 26 consultas publicadas e as 40 do diagnóstico anterior permanecem iguais.
- Datasets publicados e fixtures PRE-06: preservados byte a byte.

Os bancos e contêineres temporários foram removidos. O banco de desenvolvimento foi preservado.

## Limites da conclusão

As quatro falhas não se repetiram nas baterias executadas. A avaliação suplementar continua
sendo diagnóstico de desenvolvimento, com gabarito provisório, e não uma avaliação independente
aprovada pelo PO/time. O corpus contém somente seis chunks e não comprova qualidade em escala.
A curadoria e as metas de relevância ainda dependem da revisão do time.

O pico histórico de 3.352 ms permanece registrado na revisão anterior; não ocorreu nas
144 chamadas finais. Ele não é declarado corrigido ou apagado por esta mudança de recuperação.
O aceite formal e a revisão por outra pessoa continuam pendentes. Não houve publicação no GitHub.
