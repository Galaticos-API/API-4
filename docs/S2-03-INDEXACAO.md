# S2-03 — Eventos e sincronização do índice

A entrega consolida S2-03 e S2-04 (PBI-02.2.2 e PBI-02.2.3). A base é a main atualizada em 14/10/2026, já com S2-02. O processamento de arquivos continua no pipeline de documentos; itens e decisões usam o contrato estruturado existente da IA, /ingest/entity, que produz um trecho por origem.

## Publicação e processamento

A migration 019 cria indice_origem e a outbox indice_evento. Triggers nas tabelas de origem publicam o snapshot na mesma transação da escrita do backend. Se a alteração falhar, o evento também é desfeito. Não há escrita de dados de negócio pela IA.

Épicos, features e PBIs concluídos são elegíveis quando nenhum ancestral está arquivado. Decisões salvas são elegíveis mesmo com o item em rascunho. O snapshot inclui projeto, tipo, nível, status, conteúdo, código do PBI, critérios, proveniência e tecnologias. Alterar critérios, tecnologias ou o nome de uma tecnologia também atualiza a origem.

A outbox mantém a última versão por origem e projeto. Mudanças sucessivas antes do consumo são consolidadas; evento_id muda a cada snapshot distinto e versao aumenta. Repetir um snapshot não cria um novo evento. Esta tabela é fila e estado atual, não histórico de todas as versões.

O worker do Node consulta a fila a cada 15 segundos, usa reserva de três minutos, timeout HTTP de dois minutos e até cinco tentativas com backoff. Valida conteúdo, projeto, tipo e vetor finito não nulo de 1024 dimensões. O Node grava um único trecho por origem, com ID determinístico, em transação.

A conclusão exige o mesmo evento e a mesma reserva ainda válida. Respostas de eventos substituídos, removidos ou arquivados não podem sobrescrever o índice. Falhas registram somente códigos seguros. O evento permanece disponível para nova tentativa manual após o limite.

## Atualização e arquivamento

Ao mudar uma origem, o trecho anterior sai da busca até a nova versão terminar; não há janela com conteúdo antigo apresentado como atual. Ao arquivar a origem, um ancestral ou o projeto, a retirada ocorre na própria transação, sem esperar a IA. O consumidor de remoção não chama o serviço de embeddings. O arquivamento também limpa trechos legados.

A publicação recalcula os snapshots do projeto afetado para cobrir decisões herdadas e alterações nos ancestrais. Projetos muito grandes podem exigir otimização futura dessa varredura. Não há varredura de todo o acervo a cada ciclo do worker.

## Operação

Aplicar as migrações com npm run migrate no backend e reiniciar o backend. O worker inicia junto com o serviço. Usa AI_SERVICE_URL e AI_SERVICE_TOKEN já existentes, sem novas bibliotecas ou segredo adicional.

- GET /api/v1/projects/{projectId}/index-events lista os últimos 100 eventos, sem payload, com versão, operação, estado, tentativas, próxima tentativa e código da falha.
- POST /api/v1/projects/{projectId}/index-events/{eventId}/reprocess exige admin ou PO. Repetições enquanto pendente preservam a fila; reserva ativa ou projeto arquivado retorna 409. Evento de outro projeto ou substituído retorna 404.
- Ambos os endpoints seguem a autenticação e a guarda de acesso ao projeto.

O serviço IA mantém o endpoint estruturado já usado pelo projeto. Não foi criado workflow n8n adicional nem alterado o pipeline de documentos da S2-02.

## Validação

No backend:

```text
npm run typecheck
npm test
node --import tsx scripts/test-indexing-db.mts
node --import tsx scripts/test-indexing-db.mts --real-ai
```

O roteiro cria PostgreSQL 16/pgvector em contêiner separado, aplica todas as migrações e remove banco e contêiner ao terminar. O modo real-ai exige sinapse-ai-service e Ollama locais ativos; encaminha as requisições ao endpoint real sem imprimir credenciais.

Os testes cobrem publicação após conclusão, decisões salvas/alteradas, rollback, reexecução, substituição, metadados, tecnologias, critérios, reservas exclusivas, falhas, nova tentativa, respostas atrasadas, limite de tentativas, isolamento entre projetos, autenticação, autorização e retirada da busca ao arquivar. A integração real verifica embedding 1024d, busca híbrida, atualização do texto sem duplicação e arquivamento.

A revisão humana e a integração por Pull Request continuam etapas posteriores à implementação.

### Resultado em 14/10/2026

Suíte geral: 338 testes aprovados, sem falhas; 29 testes condicionais ignorados nessa execução. Execução específica com PostgreSQL/pgvector e IA real: 7 testes aprovados, sem falhas ou skips, incluindo os cenários de API e busca. Todos os ambientes de banco criados para os testes foram removidos.

### Revisão de erros em 14/10/2026

Três falhas foram reproduzidas antes da correção e cobertas por regressões:

- Renomear o cenário BDD não alterava o snapshot. O nome agora faz parte do conteúdo indexado.
- Excluir um ancestral em rascunho podia deixar decisões órfãs indexadas. O evento agora preserva os IDs dos ancestrais para localizar o projeto mesmo depois da exclusão.
- Uma reserva podia expirar enquanto a conclusão aguardava um lock. A validade agora usa o relógio atual do PostgreSQL, e não o horário fixado no início da transação.

Após as correções: 338 testes gerais aprovados (29 condicionais ignorados), 7 testes específicos aprovados com PostgreSQL e IA real (sem skips), e verificação de tipos aprovada.

### Segunda revisão em 14/10/2026

Dois problemas adicionais foram reproduzidos antes da correção:

- Relógio do backend adiantado podia liberar uma reserva ainda ativa. O reprocessamento agora consulta a validade pelo relógio do PostgreSQL.
- A recuperação de reservas expiradas não respeitava o projeto informado ao claim. O filtro de projeto agora vale também para essa etapa; o worker global continua processando todo o acervo.

Os testes adicionais também confirmaram transferência entre projetos sem resíduos ou resposta atrasada, reservas exclusivas com workers simultâneos e rollback de falha de gravação preservando o índice anterior. As fixtures usam nomes exclusivos para não colidir em execuções paralelas.

Execução específica com PostgreSQL/pgvector e IA real: 12 testes aprovados, sem falhas ou skips. Verificação de tipos e compilação aprovadas.

### Rodadas ampliadas em 14/10/2026

Foram concluídas cinco rodadas de oito sequências com 80 operações cada (3.200 operações), incluindo alterações de título e estado, critérios BDD, tecnologias, transferência entre projetos, exclusão de decisões, rollback, falhas e respostas atrasadas. O índice foi comparado após cada operação a um modelo independente das origens; ao esvaziar a fila, toda origem elegível precisava aparecer exatamente uma vez e com metadados atuais.

A execução final específica aprovou 32 testes/subtestes sem falhas ou skips, incluindo IA real. Também foram testados nove retornos inválidos/erros HTTP, criação de critério e conclusão pela API, decisão salva pela API, permissões de desenvolvedor alocado e migração sobre dados preexistentes com reaplicação sem duplicação.

Não apareceram novos defeitos no programa nessas rodadas. Foi ajustado o gerador de cenários, que inicialmente repetia a ordem de critérios; o banco rejeitou corretamente esses dados de teste.

Suíte geral: 338 aprovados, zero falhas e 37 condicionais ignorados. Tipos e compilação aprovados. Os testes específicos de PostgreSQL estão incluídos no CI e podem ser executados com npm run test:integration:indexing; para incluir IA real, usar npm run test:integration:indexing -- --real-ai. O CI não inicia Ollama e, portanto, ignora somente o cenário de IA real nessa etapa.
