# Organização do backend

A aplicação mantém os contratos HTTP e os aliases existentes. O código é organizado por domínio em src/modules.

- app.ts configura Express, middlewares, rotas e tratamento de erros. Importá-lo não inicia o servidor ou o worker.
- index.ts é o ponto de entrada do processo: inicia o servidor e o worker de documentos.
- *.routes.ts registra endpoints e permissões.
- *.controller.ts adapta requisições e respostas HTTP e encaminha erros ao middleware global.
- *.service.ts contém validações e coordena operações do domínio.
- *.repository.ts concentra SQL e acesso ao PostgreSQL; aceita a dependência de banco pelo construtor.
- *.types.ts declara os contratos de dados do módulo quando necessário.

Administração, desenvolvedores e busca seguem essas camadas. O catálogo de tecnologias faz apenas uma leitura: seu controller usa o repository diretamente, evitando um service que somente repassaria a chamada.

A busca preserva os parâmetros projeto_id e projectId e o acervo global quando nenhum projeto é informado, conforme o contrato existente. Valores repetidos/objetos são rejeitados com HTTP 400, em vez de provocar erro interno ao chamar trim. Filtros SQL continuam parametrizados.

As estatísticas administrativas usam uma única consulta. As três leituras independentes do painel de desenvolvedores executam em paralelo. A carga demonstrativa usa POST /api/v1/admin/demo-seed com projeto_id obrigatório. O alias /ingest-seed continua disponível com o mesmo corpo obrigatório. Não existe escolha implícita do primeiro projeto, geração de vetores ou reindexação nessa ação. Identificadores estáveis por projeto e versão impedem duplicação; a carga é auditada na mesma transação e rejeita projetos arquivados. Dados demonstrativos antigos não são removidos automaticamente. chunksIndexados conta somente trechos com embedding não nulo.

## Validação

Execute npm test e npm run typecheck nesta pasta. architecture.routes.test.ts cobre permissões administrativas, carga sem projeto, aliases e validação da busca, parâmetros SQL e propagação segura de erros. O teste de tecnologias e a suíte OpenAPI verificam os contratos existentes.

Os testes PostgreSQL usam bancos descartáveis identificados como teste. Execute a suíte com ARCHIVE_TEST_DATABASE_URL, BACKLOG_TREE_TEST_DATABASE_URL e SEED_TEST_DATABASE_URL configuradas para o banco de teste para incluir as verificações de integração.

## Limites das transações

`database/transaction.ts` centraliza commit, rollback e liberação da conexão nos repositórios de projetos, épicos, features, PBIs, critérios e administração. Uma falha no rollback descarta a conexão e preserva o erro original. A leitura da árvore mantém uma transação somente de leitura com snapshot REPEATABLE READ.

`ProjectsRepository` preserva o contrato público e delega para `projects.queries.ts` (consultas), `projects.commands.ts` (cadastro/edição), `projects.backlog.ts` (árvore) e `projects.archive.ts` (impacto/arquivamento). Consultas de resposta em edição e arquivamento usam a conexão da transação, sem adquirir uma segunda conexão do pool.

Consultas de épicos, features e PBIs aceitam um executor opcional. Dentro de transações, use sempre o mesmo PoolClient, inclusive para ler a resposta antes do COMMIT. Isso permite executar atualizações e conclusões com um pool de uma única conexão.

A conclusão de PBI recebe uma validação obrigatória executada depois dos locks da hierarquia e antes de alterar o status. QualityService propaga o client às consultas do PBI, critérios e configuração; a configuração usa FOR SHARE até o commit. A ordem de locks da hierarquia é a mesma usada pelas escritas de critérios. Uma conclusão repetida não gera nova auditoria.

priority-fixes.db.test.ts verifica pool unitário, rollback por falha de auditoria, exclusão concorrente de critério, bloqueio da configuração e cargas simultâneas sem duplicação. O workflow de CI executa esse arquivo junto aos testes PostgreSQL.

As escritas na hierarquia adquirem `FOR UPDATE` na linha do projeto antes dos locks dos descendentes. Escritas de critérios, documentos, decisões e arquivamentos usam a mesma ordem. Projetos diferentes não compartilham esse bloqueio. A transação da leitura da árvore continua usando snapshot REPEATABLE READ.

## Chat e ingestão

Novas conversas exigem projeto. O projeto é imutável durante a conversa. Admins e POs podem consultar projetos; desenvolvedores precisam de alocação ativa, considerando início e fim. O endpoint `/chat/projects` lista as opções permitidas. Conversas antigas sem projeto são preservadas no banco, mas não participam de consultas globais nem aparecem na lista ativa do chat.

Perguntas são persistidas como `pending`, com atualização da conversa na mesma transação. A resposta e a transição para `completed` também são atômicas. Falhas ficam como `failed`; tentativas interrompidas há mais de dois minutos aparecem como falhas no histórico. Somente uma pergunta fica em processamento por conversa. Chamadas de rede não mantêm uma transação aberta.

O cliente Python recebe `query`, `project_id` e trechos selecionados pelo backend somente no projeto autorizado. As fontes retornadas ao usuário vêm desses trechos, não de identificadores inventados pelo modelo. Sem evidências, o modelo não é chamado. A recuperação atual do chat usa busca textual.

A migração `014_chat_and_ingestion.sql` adiciona estados de mensagens e leases de processamento de documentos. A fila de ingestão e seu worker ficam em `documents.ingestion.ts`. Consulte [a configuração dos workflows](../n8n/README.md). Os testes de ingestão cobrem falha, retentativa, lease concorrente, dimensão dos vetores, idempotência e remoção durante processamento.

### Acesso por projeto e comunicação interna

PO/admin podem consultar todos os projetos. Desenvolvedores precisam de alocação ativa; coleções são filtradas antes da paginação e detalhes sem acesso retornam 404. A regra é compartilhada por projetos, backlog, documentos, decisões, histórico, busca e chat, incluindo aliases `/api`.

Defina `AI_SERVICE_TOKEN` com um segredo aleatório em `.env`. O Compose exige a configuração e não publica a porta do Python. O workflow n8n deve ser atualizado para encaminhar `X-Service-Token`. Não versione esse segredo.

O chat somente apresenta IDs explicitamente citados que pertencem ao contexto recuperado. Respostas sem citações válidas usam o fallback textual; essa validação não comprova semanticamente cada afirmação.

## Fila de análise de repositórios

A migration 016 registra a solicitação antes de chamar o Python. O worker usa lease e um run_id estável; perda de resposta HTTP repete a solicitação sem iniciar outro trabalho. Clientes podem enviar Idempotency-Key (UUID) e devem reutilizá-la no retry do mesmo formulário. Retomadas também são enfileiradas sob o bloqueio do projeto. Nenhuma chamada HTTP mantém transação aberta.

Há no máximo uma análise não finalizada por projeto e três por usuário. O arquivamento pede que a análise seja concluída ou cancelada primeiro; solicitação e arquivamento usam o mesmo lock. Cancelar antes do primeiro despacho dispensa o Python. Depois de um despacho incerto, o cancelamento é durável e será entregue quando o serviço voltar.

Conclusão e disponibilidade do relatório são separadas: análises concluídas sem relatório continuam sendo sincronizadas pelo worker e pela tela. Execução inexistente no Python torna-se falha explícita. O volume repo_analysis_data preserva checkpoints; um clone sem marcador de conclusão é refeito, descartando resumos incompatíveis.

O Analyzer no container Linux usa abertura de arquivos sem seguir links (inclusive diretórios intermediários), aceita apenas arquivos regulares e mantém o suporte a UTF-8/16/32. Há dois workers ativos e seis posições de espera por processo Python. Execute uma única instância de Uvicorn por volume de workspace.

O clone tem limites de memória virtual, CPU, tamanho por arquivo e duração; seu grupo de processos é encerrado em cancelamento ou excesso. O espaço por repositório e pelo workspace é monitorado a cada 100 ms durante o clone: pode haver excesso transitório entre medições, portanto isso não substitui uma quota de filesystem para um teto estrito de bytes. Compose limita o serviço Python a 2 CPUs, 1 GiB e 128 processos. Ollama é um serviço separado. Os valores de fila/clone estão em .env.example.
