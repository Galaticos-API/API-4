SYSTEM = """/nothink
Você é um engenheiro de software responsável por analisar um repositório real.
Sua regra principal é: NÃO invente fatos.

Analise somente as evidências fornecidas.
Quando algo não puder ser confirmado, escreva "não determinado pelas evidências disponíveis".
Diferencie:
- fato observado;
- inferência razoável;
- possível problema.

Ao analisar código, considere nomes, fluxo, chamadas, imports, estruturas e configuração.
Se encontrar um possível bug, não o declare como bug confirmado. Explique a evidência e a condição que poderia causar o problema.

Responda em português técnico, claro e objetivo.
"""


def chunk_prompt(path, language, chunk_index, total_chunks, content, symbols):
    return f"""Analise o bloco {chunk_index}/{total_chunks} do arquivo `{path}`.

Linguagem: {language}

Símbolos estáticos conhecidos:
{symbols}

Código/documentação:
```text
{content}
```

Produza:
1. propósito deste bloco;
2. funcionalidades observadas;
3. lógica e fluxo;
4. funções/classes relevantes;
5. dependências e integrações;
6. possíveis problemas, somente se houver evidência;
7. evidências concretas (arquivo e linhas aproximadas quando possível).

Não invente informações ausentes."""


def single_chunk_prompt(path, language, symbols, content):
    """Usado quando o arquivo inteiro cabe em um único bloco: produz
    diretamente a análise consolidada do arquivo em UMA chamada ao modelo,
    em vez de uma chamada por bloco seguida de uma chamada de consolidação.
    """
    return f"""Analise o arquivo `{path}` ({language}) por completo - ele cabe
integralmente em um único bloco, então esta é a análise final e consolidada
do arquivo (não apenas de um trecho).

Símbolos estáticos conhecidos:
{symbols}

Código/documentação:
```text
{content}
```

Escreva uma análise única contendo:
- finalidade;
- responsabilidades;
- funcionamento;
- funções/classes;
- dependências;
- integrações;
- possíveis problemas, somente se houver evidência;
- evidências concretas (arquivo e linhas aproximadas quando possível).

Não invente informações ausentes."""


def file_synthesis_prompt(path, language, symbols, chunk_summaries):
    joined = "\n\n--- BLOCO ---\n\n".join(chunk_summaries)
    return f"""Consolide a análise do arquivo `{path}` ({language}).

Estrutura estática:
{symbols}

Análises dos blocos:
{joined}

Escreva uma análise única contendo:
- finalidade;
- responsabilidades;
- funcionamento;
- funções/classes;
- dependências;
- integrações;
- possíveis problemas;
- evidências.

Não introduza fatos que não apareçam nas evidências."""


def project_synthesis_prompt(inventory, file_summaries):
    joined = "\n\n===== ARQUIVO =====\n\n".join(file_summaries)

    return f"""Você é o analista principal do repositório.

INVENTÁRIO:
{inventory}

ANÁLISES DOS ARQUIVOS:
{joined}

Produza a síntese técnica do projeto em formato Markdown estruturado.

Inclua:
# Visão Geral
# Objetivo Inferido
# Stack Tecnológica
# Arquitetura e Estrutura de Diretórios
# Módulos e Responsabilidades
# Funcionalidades Identificadas
# Fluxos Principais
# Dados e Persistência
# APIs e Integrações
# Configuração e Execução Local
# Testes e Qualidade
# Docker e CI/CD
# Segurança
# Possíveis Problemas e Débitos Técnicos
# Pontos Fortes Observados
# Lacunas de Documentação
# Evidências Concretas

Se alguma seção não puder ser determinada, declare explicitamente isso.
Não invente tecnologias, funcionalidades ou arquitetura."""
