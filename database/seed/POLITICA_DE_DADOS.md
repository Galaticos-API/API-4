# Política de dados iniciais — PRE-06

## Decisão e finalidade

Em 14/09/2026, o solicitante confirmou nesta tarefa o uso de API-1, API-2 e API-3,
seguindo a origem D3 registrada em `docs/backlog/README.md`. Não foi adotado Plano B
fictício. Finalidade: desenvolvimento e validação local de busca e reúso documental.
A base é um recorte de requisitos públicos, não uma cópia dos sistemas anteriores.

## Curadoria aplicada

- API-1: `readme.md`, itens 23 e 35 do backlog (acesso administrativo e gráficos).
- API-2: `DOCS/Documentação das Sprints/DocSprint1.md`, US-01 e US-02.
- API-3: `DOCS/analise_backend/analiseRequisitosBackend.md`, GRF-01 e GRF-08.

Entram apenas resumos dos requisitos selecionados. Ficam fora autores, nomes de
colaboradores, contatos, clientes identificáveis, código-fonte, configuração de IDE,
segredos, anexos de teste, imagens de atestados, avaliações individuais e documentos
brutos. Os clientes aparecem como “Organização não identificada”; não existe tabela
de correspondência com pessoas no seed. Referências aos repositórios são mantidas
para rastreabilidade, portanto não se promete anonimização absoluta das fontes públicas.

Os textos são resumos produzidos com assistência de IA, sujeitos à revisão do PR.
Não foram convertidos em histórias ou critérios adicionais que não existam nas fontes.
Links, revisões e hashes identificam a evidência consultada, sem importar o documento
inteiro nem os dados de exemplos operacionais. O hash registra o texto fonte obtido
em UTF-8; não é uma alegação de aprovação jurídica ou de conteúdo íntegro de um PDF.

## Origem e integridade

Cada entidade possui origem no manifesto e um evento determinístico `seed_import`
na tabela `auditoria`. Chunks também carregam URL, revisão e hash nos metadados.
Eventos não recebem autor humano fictício; `usuario_id` permanece nulo e a seleção
das fontes fica documentada no manifesto. O carregador usa parâmetros SQL e emite
somente contagens ou erro genérico, sem URLs de conexão ou payloads em logs.

## Uso e limitações

A escolha das fontes foi autorizada pelo solicitante. A revisão humana do recorte
deve ocorrer no PR antes de sua distribuição. O carregador é restrito a ambientes
de desenvolvimento/teste; não usar em produção ou em base compartilhada de cliente.

Não se infere competência individual a partir de tecnologias do repositório. Não
foram carregados usuários, alocações ou competências pessoais; consultas “quem
trabalhou com X?” devem retornar ausência de evidência individual. Para demonstrar
respostas positivas do PBI-05.2.1, o time ainda precisa fornecer evidência de alocação
curada e autorizada, sem inventar vínculos entre pessoas e requisitos.

Busca semântica exige embeddings reais. Os chunks têm vetor nulo e metadado
`embedding_status=pending`; documentos continuam `pendente` para indexação. Os casos
de validação descrevem expectativas do acervo, não resultados de um motor já testado.

## Revisão, retenção e retirada

Toda ampliação exige origem versionada, curadoria de dados pessoais e revisão por
outra pessoa. Não importar diretórios inteiros. Se uma fonte precisar ser retirada,
identificar seus IDs pelo manifesto, revisar referências e excluir conteúdo e
vetores em uma migração aprovada; preservar apenas a trilha de retirada necessária,
sem reter conteúdo sensível no evento. Ambientes descartáveis devem ser eliminados
ao final dos testes. Nunca apagar ou alterar silenciosamente dados fora do dataset.
