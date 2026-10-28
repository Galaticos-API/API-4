# Acervo complementar de demonstração — Plataforma Sinapse

> Documento para testes locais de busca e chat. O resumo arquitetural abaixo acompanha o contexto registrado do produto. O identificador “canário” é dado sintético exclusivo de QA; não é uma decisão de negócio nem dado de produção.

## Propósito e escopo

A Plataforma Sinapse organiza conhecimento institucional da PRO4TECH para apoiar Product Owners, desenvolvedores e novas pessoas da squad. Seu foco é especificação de requisitos, decisões técnicas, documentos de projeto, competências e consulta de conhecimento reutilizável. O Azure DevOps continua sendo a fonte oficial para execução de sprint, quadro Kanban, apontamento de horas e burndown; a Sinapse não substitui essas funções.

## Arquitetura registrada

O frontend é uma aplicação React 19 com Vite e TypeScript, servida localmente na porta 5173. O backend usa Node.js 20 ou superior, Express e TypeScript na porta 3001; ele é o único serviço autorizado a persistir dados de negócio. O serviço de IA usa Python 3.11, FastAPI e a porta 8000. PostgreSQL 16 com pgvector é o banco relacional e vetorial, exposto localmente na porta 55432.

## Busca e assistente

O acervo calcula embeddings localmente com BAAI/bge-m3, vetores de 1024 dimensões, usando Ollama. O modelo de geração local registrado para o projeto é qwen2.5:1.5b. A recuperação combina similaridade vetorial e busca textual em PostgreSQL, aplica filtro obrigatório por projeto e entrega até cinco trechos ao assistente. Respostas factuais devem citar as fontes utilizadas; sem evidência, o assistente deve informar que não encontrou a informação no acervo.

## Ingestão e persistência

Documentos enviados ao projeto entram pelo backend, passam pelo fluxo de ingestão e são divididos em trechos com metadados e embeddings. O serviço Python prepara texto e embeddings, mas não grava tabelas de negócio. O backend Node valida o projeto e persiste os dados. Reprocessar ou atualizar documento precisa manter a relação entre projeto, documento, chunks e fonte citada.

## Segurança e governança

Cada consulta deve permanecer limitada aos projetos que o usuário pode acessar; proximidade semântica não concede autorização. Perfis administrativos, Product Owner e desenvolvedor têm permissões distintas. A IA atua como copiloto: não altera requisitos diretamente e não transforma sugestões em dados de negócio sem ação humana explícita. A inferência e os embeddings previstos para o núcleo rodam localmente, sem dependência de provedor externo.

## Requisitos e qualidade

Um PBI deve começar com verbo no infinitivo e conter história completa nos campos “Como um”, “Eu quero” e “Para que”. Deve ter ao menos um cenário BDD completo com “Dado”, “Quando” e “Então”. Termos vagos precisam ser sinalizados. A validação de protótipo só se aplica quando o PBI requer interface. A pontuação é determinística e calculada no backend.

## Perguntas úteis para QA

- Qual banco de dados e extensão vetorial são usados?
- Qual modelo gera os embeddings e quantas dimensões ele tem?
- Qual modelo local responde às perguntas do chat?
- Como a busca combina termos exatos e significado?
- Como o sistema impede acesso ao acervo de outro projeto?
- Quem persiste os dados que o serviço de IA prepara?
- O que o assistente deve fazer quando não há evidência?
- O que precisa existir em um PBI para atender aos critérios de qualidade?
- A Sinapse substitui o Azure DevOps para burndown?

## Canário sintético de QA

Este fato é deliberadamente inventado para verificar que o chat consulta o documento correto e cita sua origem: **Canário exclusivo da fixture local Sinapse: código `SIN-QA-314`; a cor fictícia do farol de teste é azul-petróleo.** Não use esse código como informação real do produto.

## Lacunas intencionais

Este documento não define credenciais, nomes de usuários reais, fornecedor financeiro contratado, domínio público de produção nem uma data de lançamento aprovada. O assistente deve se abster de responder esses pontos se eles não estiverem registrados em outra fonte autorizada do projeto.
