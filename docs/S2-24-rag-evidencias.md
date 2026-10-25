# S2-24 — RAG com evidências verificadas

O chat usa a busca híbrida da S2-06 e a revisão vigente do harness de consulta da S2-09. A resposta é extrativa: o modelo seleciona passagens literais para responder à pergunta; o backend monta o texto e as fontes. Não há paráfrase livre, afirmações adicionadas pelo modelo ou lista de fontes inferida do texto gerado.

## Fluxo

1. Autenticar e resolver os projetos permitidos antes de consultar embeddings. Uma seleção explícita não autorizada recebe 404.
2. Gerar um embedding e recuperar até cinco chunks com a mesma busca híbrida e limiares configurados para a busca. O escopo transversal usa uma consulta sobre o conjunto autorizado, sem misturar resultados restritos.
3. Excluir origens inexistentes, inelegíveis, arquivadas e relatórios de IA sem aprovação vigente. Itens/decisões usam a visão `indice_origem`, a mesma do pipeline de indexação.
4. Limitar o contexto a 20.000 caracteres no total e 8.000 por trecho. O serviço Python recebe o schema estruturado de seleção de evidências via harness, com até cinco citações de 1.000 caracteres.
5. Normalizar UUIDs válidos para minúsculas antes de comparar as fontes e remover duplicações. Rejeitar qualquer ID que não esteja no contexto enviado, citação não literal, fragmento incompleto de frase/linha ou campo extra. Isso impede, por exemplo, recortar a palavra “não” de uma frase para inverter sua afirmação. Remover repetições e montar a resposta com texto validado, escapando formatação Markdown do acervo. Consultas transversais identificam explicitamente o projeto de cada passagem.
6. Reconsultar as origens e permissões após a geração e verificar os limites da passagem também no texto completo atual. Conteúdo integral, projeto, tipo, item e metadados do chunk precisam coincidir com a recuperação original. Isso impede publicar uma resposta antiga quando a fonte ganhou uma ressalva, mesmo que a frase citada continue presente. Uma revogação, retirada da fonte ou frase cortada pelo limite do contexto também impede divulgar a resposta. Fontes identificam projeto, tipo, item, chunks efetivamente usados e rota de navegação; vários chunks do mesmo item são agrupados.

Sem recuperação ou evidências pertinentes, retornar `Informação não encontrada no acervo do projeto.` e listas vazias. Indisponibilidade ou saída inválida retorna 503; o chat mantém a pergunta para nova tentativa e registra a mensagem como falha. Não existe fallback que transforme erro de validação em resposta não verificada.

Uma nova tentativa limpa a pergunta restaurada quando ela é reenviada. Se o usuário já começou outra pergunta, esse novo texto é preservado tanto no sucesso quanto na falha da tentativa anterior. Em outra indisponibilidade, a pergunta original volta ao campo se ele estiver vazio.

O carregamento inicial ou a recuperação do histórico não pode abrir uma conversa antiga por cima de uma nova pergunta. A abertura automática da última conversa só ocorre antes de qualquer interação do usuário; respostas atrasadas respeitam a revisão atual da seleção. Há teste de navegador que atrasa a consulta do histórico enquanto o usuário escolhe o projeto e digita.

Ao abrir uma conversa, o envio aguarda suas mensagens carregarem para impedir que uma consulta antiga substitua a resposta nova. O campo continua editável, inclusive durante essa espera. Os testes cobrem submissão direta durante o carregamento e a chegada de uma resposta de outro projeto depois de iniciar uma nova conversa, preservando o novo texto e seu escopo.

Falhas ao carregar os projetos exibem um aviso e permitem recarregar a lista sem apagar a pergunta ou trocar a conversa atual. O carregamento, a ausência de projetos e a falha de conexão têm estados distintos. Testes cobrem a recuperação seguida de envio e novas falhas na tentativa de recarregar.

## API

`POST /api/v1/chat/answer` recebe `pergunta` e, opcionalmente, `projeto_ids`. Omitir projetos consulta o conjunto permitido ao usuário; enviar projetos restringe a consulta. Retorna `contrato: rag-extrativo-v1`, `resposta`, `evidencias`, `fontes` e `escopo`. Essa operação transversal não cria conversa.

`POST /api/v1/chat/query` mantém o contrato de conversas por projeto e utiliza o mesmo RAG. Acrescenta `evidencias` à resposta e persiste as fontes utilizadas; a interface oferece links com projeto e origem. A seleção transversal na interface de conversas permanece separada deste endpoint sem persistência.

As revisões e instruções do harness continuam entrando em vigor sem reinício. O contrato extrativo é imposto pelo backend, independentemente do texto administrativo do prompt. Nenhuma pergunta, contexto, saída bruta ou credencial é incluída nos erros devolvidos ou logs da integração.

## Revisão consolidada de 25/10/2026

Foram reproduzidos em testes e corrigidos cinco problemas adicionais:

| Problema | Correção e evidência |
|---|---|
| O navegador encerrava a consulta aos 60 segundos, embora os embeddings possam consumir até 10 segundos antes da geração configurável de até 60 segundos. | Prazo total de 90 segundos, preservando cancelamento explícito. Teste com relógio simulado confirma resposta aos 65 segundos e outro confirma o cancelamento solicitado pelo chamador. |
| Reabrir uma conversa com a última pergunta em falha não oferecia nova tentativa; a seleção de falhas também podia escolher uma pergunta antiga. | Recuperação da última pergunta pendente de resposta a partir do histórico persistido. Testes confirmam o texto reenviado e que falhas antigas não reaparecem como pendências depois de uma resposta. |
| A lista de projetos aceitava identificadores numéricos e nomes em formato de objeto, que poderiam causar erro ao renderizar a interface. | Validação dos dados antes de entregá-los à tela; dados inválidos passam pelo aviso recuperável de falha. |
| Digitar ou selecionar uma sugestão antes da chegada do histórico ainda permitia a seleção automática de uma conversa antiga e de seu projeto. | Essas interações também invalidam a abertura automática inicial. Os dois caminhos têm testes separados. |
| Uma consulta antiga da lista de conversas podia terminar depois de uma atualização e substituir o histórico mais recente. | Cada carregamento tem uma sequência; respostas e erros de consultas anteriores são ignorados. Teste mantém a conversa recém-criada na lista e no cabeçalho. |

A revisão incluiu ainda permissões por projeto, revalidação das fontes após a geração, limites de entrada/contexto, citações literais, deduplicação, links internos, falhas repetidas, recuperação da conexão e contratos da API. Não foram reproduzidas outras falhas nesses caminhos. A avaliação semântica com o modelo local real continua separada dos testes de integração com Ollama simulado.

## Validação

Integração com a main verificada em 25/10/2026: após `git fetch origin`, HEAD e `origin/main` apontavam para `c4c9d53b0dfcb25d5100031c42e813436ca5c1c0`, sem commits divergentes. As alterações da S2-24 estão aplicadas diretamente sobre essa base, sem conflito textual a resolver. Foram repetidos os builds de backend/frontend, a compilação de sintaxe Python, o teste dos scripts Windows, `docker compose --env-file .env.example config --quiet` com tokens de exemplo e `n8n-sync validate`; todos passaram. O arquivo `.env` local foi preservado. Isso verifica a integração com esse commit; uma atualização posterior da main exige nova comparação.

- Backend e frontend: builds, verificação de tipos e testes unitários.
- `npm run test:integration:quality`: banco isolado, busca híbrida transversal, isolamento por alocação, ausência de resultados, fontes inventadas, revogação durante a geração e arquivamento.
- `npm run test:integration:copilot`: backend + FastAPI real + Ollama simulado, validando também o contrato de evidências do chat e a proveniência de relatórios.
- `npm run test:integration:indexing` e `npm run test:integration:review`: regressões da indexação e navegação autenticada.

Esses testes demonstram o contrato e as guardas; não substituem avaliação de relevância pelo PO/time nem medem qualidade do modelo local real. Os limiares atuais da S2-17 são reutilizados, sem declarar encerrada a revisão de relevância do backlog. Revisão por outra pessoa permanece como aprovação externa.

Validação em 25/10/2026: a revisão consolidada repetiu o build e os 86 testes da interface, a verificação de tipos e os 69 testes do backend, os 26 testes de qualidade/RAG em PostgreSQL, a suíte de regressão de indexação e os 13 testes de navegação autenticada. Os testes executados passaram. A OpenAPI foi lida sem erros, com 104 caminhos. O harness FastAPI real com Ollama simulado também passou, incluindo consulta transversal, rejeição de respostas fora do schema, chat autenticado, fontes navegáveis, preservação do escopo escolhido e recuperação após indisponibilidade. Um teste opcional de indexação com IA real não foi executado.
