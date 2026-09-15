# GraphRAG aplicado ao Sinapse
**Base Inteligente de Requisitos - API-4 / Grupo Galáticos**
*Proposta técnica de evolução do RAG vetorial para recuperação orientada por relações*

| Atributo | Detalhe |
| :--- | :--- |
| **Projeto** | Base Inteligente de Requisitos |
| **Repositório** | `Galaticos-API/API-4` |
| **Contexto** | PRO4TECH Fatec São José dos Campos (4º semestre / 2º semestre de 2026) |
| **Objetivo** | Explicar GraphRAG e propor sua implementação integrada à arquitetura existente |
| **Tipo de Documento** | Documento técnico / proposta de arquitetura |

---

## 1. Resumo executivo
O Sinapse já possui uma arquitetura de RAG baseada em PostgreSQL 16+ pgvector, Ollama, um serviço de IA em Python/FastAPI e n8n para orquestração. Essa abordagem é adequada para recuperar trechos semanticamente próximos de uma pergunta, mas pode perder relações importantes entre projetos, PBIs, tecnologias, pessoas, decisões e documentos.

GraphRAG propõe uma evolução dessa arquitetura: além de representar o conhecimento como chunks vetorizados, o sistema passa a representar entidades e relações explícitas. A recuperação pode então combinar similaridade semântica com navegação pelo grafo, permitindo perguntas que dependem de contexto distribuído em vários registros.

Para o API-4, a recomendação é não substituir o RAG atual de imediato. O caminho de menor risco é criar uma camada GraphRAG híbrida sobre o acervo existente, preservando PostgreSQL/pgvector, Ollama, Python e n8n. Uma implementação posterior pode projetar o grafo em Neo4j caso o volume e a complexidade das consultas justifiquem um banco de grafos dedicado.

---

## 2. O que é GraphRAG
GraphRAG (Graph Retrieval-Augmented Generation) é um padrão de RAG no qual a etapa de recuperação utiliza estruturas de grafo para encontrar, conectar e enriquecer o contexto enviado ao modelo de linguagem. Em vez de tratar cada chunk como uma unidade isolada, o sistema registra entidades, relações e a origem de cada fato, podendo navegar por conexões relevantes antes de gerar a resposta.

Em um RAG tradicional do Sinapse:
> `Pergunta` → `embedding` → `busca pgvector (top-k chunks)` → `Harness` → `Ollama` → `resposta`

Em uma abordagem GraphRAG híbrida:
> `Pergunta` → `embedding + entidades` → `Harness` → `Ollama` → `chunks relevantes + entidades/relacionamentos` → `contexto expandido` → `resposta`

A ideia central não é abandonar embeddings. O valor está em combinar duas formas de recuperação: similaridade semântica para localizar evidências textuais e relações estruturadas para conectar essas evidências.

---

## 3. Por que GraphRAG faz sentido no Sinapse
O domínio do projeto é especialmente adequado a grafos porque o próprio problema de negócio é relacional. O Sinapse quer conectar três eixos de conhecimento: projetos, pessoas e tecnologias - além da hierarquia `Projeto → Epico → Feature → PBI` e dos documentos, critérios, decisões e competências.

| Conhecimento atual | Relação que pode ser explicitada | Pergunta habilitada |
| :--- | :--- | :--- |
| **PBI** | PBI pertence a Feature / Projeto | Quais PBIs semelhantes existem neste projeto? |
| **Tecnologia** | PBI/Projeto UTILIZA Tecnologia | Em quais projetos usamos PIX + PostgreSQL? |
| **Pessoa** | Desenvolvedor TRABALHOU_EM Projeto | Quem já trabalhou com esse tipo de integração? |
| **Decisão** | Decisão APLICA_SE_A Projeto/PBI | Por que adotamos determinada abordagem? |
| **Documento** | Documento DESCREVE Projeto/PBI | Qual documento fundamenta essa decisão? |
| **Competência** | Pessoa POSSUI_COMPETENCIA Tecnologia | Quem tem experiência comprovada com a stack? |

---

## 4. RAG atual versus GraphRAG
| Aspecto | RAG vetorial atual | GraphRAG híbrido |
| :--- | :--- | :--- |
| **Unidade de recuperação** | Chunks | Chunks + entidades + relações |
| **Principal força** | Similaridade semântica | Semântica + contexto relacional |
| **Relações entre fatos** | Implícitas no texto | Explícitas no grafo |
| **Perguntas multi-hop** | Mais difíceis | Naturalmente suportadas |
| **Rastreabilidade** | Fonte do chunk | Fonte + caminho/entidades relacionadas |
| **Complexidade** | Menor | Maior |
| **Custo computacional** | Menor | Maior na ingestão e recuperação |

---

## 5. Vantagens para o projeto
* **Reúso de conhecimento:** Conecta soluções históricas, tecnologias e decisões, favorecendo a reutilização de experiências anteriores.
* **Perguntas complexas:** Permite responder perguntas que exigem combinar vários fatos, como projeto + tecnologia + pessoa + decisão.
* **Contexto mais rico:** Um chunk relevante pode levar o sistema às entidades e aos documentos relacionados, evitando contexto excessivamente fragmentado.
* **Explicabilidade:** A resposta pode indicar não apenas a fonte textual, mas também quais entidades e relações sustentaram a recuperação.
* **Onboarding:** Um novo integrante pode explorar um projeto por suas tecnologias, PBIs, decisões, documentos e pessoas envolvidas.
* **Recomendação de profissionais:** O eixo Pessoas → Tecnologias → Projetos se encaixa diretamente no objetivo de mapear competências.
* **Evolução incremental:** O RAG vetorial existente pode continuar funcionando enquanto a camada de grafo é introduzida.

---

## 6. Limitações e cuidados
* GraphRAG não elimina alucinações por si só. O Harness continua sendo necessário para obrigar o modelo a responder somente com evidências recuperadas.
* A extração automática de entidades e relações pode introduzir erros. A proveniência deve registrar de qual documento/chunk cada relação foi extraída.
* A construção e atualização do grafo aumenta a complexidade da ingestão.
* Nem toda pergunta precisa de grafo. Perguntas simples de recuperação documental podem continuar usando apenas busca vetorial.
* A expansão do contexto precisa ser limitada para evitar excesso de tokens e degradação da resposta.
* O isolamento por projeto deve continuar sendo aplicado antes da expansão do grafo, impedindo vazamento de conhecimento entre projetos.

---

## 7. Arquitetura proposta para o API-4
A arquitetura recomendada mantém os componentes já definidos no repositório. O GraphRAG entra principalmente no Serviço de IA e na camada de persistência do conhecimento. O Backend continua sendo a fronteira de negócio e o n8n continua responsável pela orquestração de ingestão.

```text
Frontend React (PO / Chat / Proveniência)
  ↓
Backend Node.js/TS (Auth + regras + isolamento)
  ↓
Python / FastAPI (RAG Engine + Graph Retrieval)
  ├──> pgvector (chunks)
  └──> Knowledge Graph (entities/edges)
        ↓
Context Builder + Harness
  ↓
Ollama / LLM

(n8n orquestra a ingestão: extração/chunking → embeddings + entidades/relações → persistência)
```

### 7.1. Opção recomendada: PostgreSQL como base do grafo
Para o primeiro MVP, é possível evitar a introdução de um novo banco. O PostgreSQL já é o banco unificado do projeto e já hospeda o pgvector. O grafo pode ser representado por tabelas de entidades e relações, consultadas com SQL e CTEs recursivas.

| Tabela | Exemplo | Função |
| :--- | :--- | :--- |
| `knowledge_entity` | TECHNOLOGY / PERSON / PROJECT | Catálogo de entidades extraídas ou estruturadas. |
| `knowledge_relation` | USES / WORKED ON / DEPENDS ON | Arestas direcionadas entre entidades. |
| `knowledge_source` | chunk_id + document_id | Proveniência da entidade/relação. |
| `chunk` | texto + embedding | Evidência textual original para recuperação vetorial. |

### 7.2. Alternativa: Neo4j como projeção do conhecimento
Se o grafo crescer e consultas multi-hop se tornarem centrais, Neo4j pode ser adicionado como um índice de conhecimento especializado, mantendo PostgreSQL como fonte dos dados de negócio. Essa separação reduz impacto sobre as tabelas transacionais, mas adiciona infraestrutura, sincronização e operação.

---

## 8. Modelo de conhecimento sugerido
Entidades prioritárias para o MVP:
* Projeto
* Épico
* Feature
* PBI
* Documento
* Chunk
* Pessoa / Desenvolvedor
* Tecnologia
* Decisão
* Competência

*Principais relações lógicas:*
`PROJECT CONTAINS EPIC`, `EPIC CONTAINS FEATURE`, `FEATURE CONTAINS PBI`, `PBI USES TECHNOLOGY`, `PROJECT USES TECHNOLOGY`, `PERSON WORKED_ON PROJECT`, `PERSON HAS_SKILL TECHNOLOGY`, `PROJECT HAS_DECISION DECISION`, `DECISION JUSTIFIES TECHNOLOGY`, `PBI RELATED_TO PBI`, `ENTITY MENTIONED_IN CHUNK`.

---

## 9. Pipeline de ingestão no n8n
1. **Trigger:** Arquivo novo, documento atualizado ou evento disparado pelo sistema.
2. **Extração:** n8n envia o conteúdo ao Serviço de IA para extração e normalização.
3. **Chunking:** O Python executa o chunking oficial, preservando projeto, documento e metadados.
4. **Embeddings:** Ollama gera embeddings com `bge-m3`; os vetores continuam no pgvector.
5. **Extração de grafo:** Ollama recebe o chunk e retorna JSON estruturado com entidades e relações.
6. **Validação:** Python valida schema, normaliza nomes e rejeita relações inválidas.
7. **Persistência:** Entidades, relações e proveniência são armazenadas na camada de conhecimento.
8. **Indexação:** O chunk recebe embedding e metadados; índices são atualizados.
9. **Auditoria:** O sistema registra documento de origem, chunk, timestamp e versão do processamento.

### 9.1. Prompt de extração estruturada
```json
{
  "entities": [
    {"type": "TECHNOLOGY", "name": "PostgreSQL"},
    {"type": "PROJECT", "name": "Sinapse"}
  ],
  "relations": [
    {"source": "Sinapse", "type": "USES", "target": "PostgreSQL"}
  ]
}
```
**Regras:** não invente entidades; use apenas informações presentes no texto; normalize nomes sem alterar o significado; cada relação deve ser suportada pelo chunk; se não houver relação confiável, retorne lista vazia.

No ambiente local do projeto, esse prompt pode ser executado pelo Ollama. O modelo atual `qwen2.5:1.5b` é adequado para um MVP de extração simples, mas a qualidade deve ser medida. Caso a extração apresente muitos erros, testar um modelo local maior é preferível a relaxar as regras de proveniência.

---

## 10. Pipeline de consulta GraphRAG
1. **Pergunta:** O PO pergunta em linguagem natural.
2. **Isolamento:** Backend e Serviço de IA recebem `project_id` e aplicam o escopo antes de recuperar dados.
3. **Busca vetorial:** O embedding da pergunta recupera os chunks mais relevantes no pgvector.
4. **Identificação de entidades:** A pergunta pode ser analisada para detectar tecnologias, projetos, pessoas ou outros conceitos.
5. **Expansão no grafo:** A partir das entidades/chunks encontrados, recuperam-se relações relevantes com limite de profundidade.
6. **Re-ranking:** Combina-se similaridade semântica, proximidade no grafo e relevância por tipo de entidade.
7. **Context Builder:** Monta um contexto compacto com evidências textuais + fatos estruturados + fontes.
8. **Harness:** Aplica as regras PRO4TECH: responder somente com evidência e citar fontes.
9. **Ollama:** Gera a resposta final.
10. **Proveniência:** Frontend apresenta fontes rastreáveis e, quando apropriado, as relações usadas na recuperação.

### 10.1. Exemplo de consulta
> **Pergunta do PO:** *"Quem já trabalhou com integração PIX e quais decisões técnicas foram tomadas em projetos semelhantes?"*
> 
> O RAG vetorial isolado tende a recuperar documentos ou chunks que mencionam PIX. O GraphRAG pode:
> * localizar a entidade TECNOLOGIA/CONCEITO relacionada a PIX;
> * encontrar projetos conectados a essa entidade;
> * percorrer `PROJETO → PESSOA` e `PROJETO → DECISÃO`;
> * recuperar os chunks que fundamentam cada relação;
> * montar uma resposta com pessoas, projetos, decisões e fontes.

---

## 11. Exemplos técnicos

### 11.1. Modelo PostgreSQL - Relação
```sql
CREATE TABLE knowledge_entity (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL
);

CREATE TABLE knowledge_relation (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    source_entity_id UUID NOT NULL,
    relation_type VARCHAR(80) NOT NULL,
    target_entity_id UUID NOT NULL,
    source_chunk_id UUID,
    confidence REAL
);
```

### 11.2. Consulta multi-hop em PostgreSQL
```sql
WITH RECURSIVE graph AS (
    SELECT source_entity_id, target_entity_id, relation_type, 1 AS depth
    FROM knowledge_relation
    WHERE project_id = $1
    UNION ALL
    SELECT g.source_entity_id, r.target_entity_id, r.relation_type, g.depth + 1
    FROM graph g
    JOIN knowledge_relation r
      ON r.source_entity_id = g.target_entity_id
     AND r.project_id = $1
    WHERE g.depth < 2
)
SELECT * FROM graph;
```
*A profundidade deve ser pequena no MVP (por exemplo, 1-2 saltos), evitando expansão indiscriminada.*

### 11.3. Se Neo4j for adotado
```cypher
MATCH (p:Person)-[:WORKED_ON]->(pr:Project)-[:USES]->(t:Technology)
WHERE t.name = $technology
OPTIONAL MATCH (pr)-[:HAS_DECISION]->(d:Decision)
RETURN p, pr, t, d
LIMIT 20
```

---

## 12. Organização dos workflows n8n
| Workflow | Responsabilidade | Saída |
| :--- | :--- | :--- |
| `GRAPHRAG_INGEST_DOCUMENT` | Receber/monitorar documento e chamar pipeline de ingestão | Chunks + embeddings + entidades + relações |
| `GRAPHRAG_UPDATE_ENTITY` | Atualizar entidades/relações quando conteúdo mudar | Grafo sincronizado |
| `GRAPHRAG_QUERY` | Receber pergunta e acionar recuperação híbrida | Contexto enriquecido |
| `GRAPHRAG_CHAT` | Integrar consulta ao chat do frontend | Resposta + fontes |
| `GRAPHRAG_AUDIT` | Registrar execução e falhas | Logs/proveniência |

O n8n deve permanecer como orquestrador, e não como local de implementação da lógica de chunking, embeddings ou recuperação. Isso preserva a fronteira arquitetural já definida no projeto.

---

## 13. Segurança, isolamento e governança
* Todo nó/aresta de conhecimento deve possuir `project_id` ou uma referência inequívoca ao projeto de origem.
* A expansão do grafo deve aplicar o filtro de projeto antes de qualquer *traversal*.
* Relações derivadas de documentos devem armazenar `source_chunk_id`.
* O LLM não deve receber entidades/relações sem evidência textual quando a política do projeto exigir fundamentação.
* Sugestões da IA continuam sujeitas à aprovação humana; GraphRAG não deve criar requisitos automaticamente.
* Dados de competências profissionais devem respeitar as regras de acesso e o tratamento LGPD definido para o sistema.

---

## 14. Como validar se GraphRAG realmente melhorou o Sinapse
A adoção deve ser tratada como experimento comparativo. O mesmo conjunto de perguntas deve ser executado contra o RAG atual e contra o GraphRAG, sem alterar o modelo final de geração durante a comparação.

| Métrica | RAG atual | GraphRAG | Objetivo |
| :--- | :--- | :--- | :--- |
| Recall de evidências | medir | medir | GraphRAG > RAG |
| Resposta com fonte correta | medir | medir | ≥ 80% do PRD |
| Perguntas multi-hop | baseline | baseline | melhoria clara |
| Latência / Tokens | medir | medir | manter dentro do RNF / sem crescimento descontrolado |
| Custo de infraestrutura | baixo | incremental | R$ 0 em APIs externas |

---

## 15. Roadmap de implementação recomendado
* **Fase 0 (Baseline):** Congelar o RAG atual e criar 20-30 perguntas representativas do domínio.
* **Fase 1 (Modelo de conhecimento):** Criar entidades/relações em PostgreSQL e associá-las a chunks com proveniência.
* **Fase 2 (Extração):** Implementar workflow n8n + Ollama para extrair JSON estruturado.
* **Fase 3 (Hybrid Retrieval):** Combinar top-k vetorial com expansão de 1-2 saltos no grafo.
* **Fase 4 (Harness):** Incluir fatos do grafo no contexto sem perder as citações textuais.
* **Fase 5 (Avaliação):** Comparar RAG x GraphRAG nas métricas definidas.
* **Fase 6 (Neo4j opcional):** Migrar/projetar o grafo para Neo4j apenas se as consultas justificarem.

---

## 16. Conclusão
GraphRAG é uma evolução natural para o Sinapse porque o conhecimento que o sistema pretende preservar é essencialmente conectado. Projetos, PBIs, tecnologias, pessoas, decisões e documentos não são registros isolados; eles formam uma rede de conhecimento.

A recomendação para o API-4 é implementar um GraphRAG híbrido incremental, mantendo PostgreSQL + pgvector, Ollama, Python/FastAPI e n8n. O primeiro objetivo não deve ser construir um grafo gigantesco, mas provar que a navegação por relações melhora perguntas de múltiplos saltos, reúso de conhecimento, onboarding e consultas sobre competências.

Essa estratégia também mantém a arquitetura atual estável: o Backend continua controlando o domínio, o Python continua sendo a fonte da lógica de RAG, o n8n continua orquestrando ingestão, o Ollama continua executando a IA local e o PostgreSQL continua sendo o banco unificado.

---

## 17. Referências
* Repositório do projeto API-4/Sinapse: [https://github.com/Galaticos-API/API-4](https://github.com/Galaticos-API/API-4)
* Documentação de arquitetura do Sinapse: [https://github.com/Galaticos-API/API-4/blob/main/docs/Architecture/README.md](https://github.com/Galaticos-API/API-4/blob/main/docs/Architecture/README.md)
* PRD do Sinapse: [https://github.com/Galaticos-API/API-4/blob/main/docs/PRD-PRO4TECH.md](https://github.com/Galaticos-API/API-4/blob/main/docs/PRD-PRO4TECH.md)
* Contexto canônico de IA e agentes: [https://github.com/Galaticos-API/API-4/blob/main/docs/AGENTS.md](https://github.com/Galaticos-API/API-4/blob/main/docs/AGENTS.md)
* Neo4j-GraphRAG: [https://neo4j.com/labs/genai-ecosystem/graphrag/](https://neo4j.com/labs/genai-ecosystem/graphrag/)
* Neo4j-GraphRAG for Python: [https://neo4j.com/docs/neo4j-graphrag-python/current/](https://neo4j.com/docs/neo4j-graphrag-python/current/)
* Neo4j- exemplo de GraphRAG: [https://github.com/neo4j-partners/sample-graphrag](https://github.com/neo4j-partners/sample-graphrag)
* n8n-workflow de GraphRAG com Neo4j: [https://n8n.io/workflows/12812-turn-a-youtube-channel-into-a-second-brain-with-neo4j-graphrag-and-gpt-40-mini/](https://n8n.io/workflows/12812-turn-a-youtube-channel-into-a-second-brain-with-neo4j-graphrag-and-gpt-40-mini/)
