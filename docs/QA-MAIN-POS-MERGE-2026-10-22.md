# QA após merge da PR #58

Referência: main `34a80ad82d091e688c51f804332e9b1c6ec37047`. O código local revisado tem o mesmo conteúdo dessa referência. As correções anteriores foram preservadas.

## Alta — busca híbrida não autoriza acesso ao projeto consultado

**Código:** `backend/src/modules/search/search.routes.ts:32` e `backend/src/modules/search/search.service.ts:46`.

A rota exige sessão, mas não encaminha o usuário autenticado à consulta. O serviço verifica apenas se o projeto existe. A guarda global de entidades protege URLs de projeto, porém não a rota `/search`, cujo projeto é informado por query string.

O filtro SQL por projeto evita misturar resultados de projetos diferentes, mas não verifica se o usuário pode consultar aquele projeto.

### Reprodução confirmada

1. Criar dois projetos A e B.
2. Alocar um desenvolvedor apenas em A.
3. Inserir documento processado e chunk indexado em B.
4. Criar sessão real do desenvolvedor.
5. Consultar `GET /api/v1/projects/{B}`: HTTP 404.
6. Consultar `GET /api/v1/search?q=confidencial&projeto_id={B}`: HTTP 200, incluindo o chunk restrito de B.

```json
{"case":"search_cross_project","direct_status":404,"search_status":200,"returns_restricted_chunk":true}
```

Reproduzido com a aplicação real, PostgreSQL/pgvector temporário e um serviço de embeddings determinístico. O mesmo comportamento foi confirmado inicialmente com chunk demonstrativo e depois com documento processado. Os dados são sintéticos.

**Impacto:** qualquer usuário autenticado que conheça o ID de outro projeto pode consultar seu acervo por essa rota, mesmo sem alocação.

**Correção indicada:** validar a autorização do projeto antes de chamar embeddings ou consultar chunks, usando a política existente `ProjectAccess`. Cobrir PO/admin, desenvolvedor alocado, sem alocação e alocação encerrada. A interface não substitui a autorização da API.

**Estado:** corrigido localmente após a revisão. A rota usa `ProjectAccess.assertEntity` antes de chamar o serviço de busca. Banco e arquivos temporários da reprodução removidos; dados locais preservados.

Esta revisão não comprova ausência de outros defeitos. Os checks verdes anteriores não cobrem esse cenário de acesso ao endpoint de busca.

## Correção e revisão complementar

- A busca aplica a mesma política usada pelas rotas de projeto, inclusive pelos aliases `projeto_id` e `projectId`.
- A regressão HTTP cobre admin/PO, desenvolvedor alocado, alocação encerrada, alocação futura, ausência de alocação, revogação na mesma sessão, sessão ausente e projeto inválido/inexistente.
- As recusas por falta de acesso acontecem antes de qualquer chamada de embeddings.
- Foram exercitadas também leituras de projeto/documentos/trechos, histórico, qualidade, épicos legados e criação de conversa. Todos os caminhos testados recusaram o projeto sem acesso.
- A inspeção complementar das listagens de épicos/features/PBIs, critérios, decisões, cadastro de usuários e administração não confirmou outra falha nesta rodada. Cadastro privilegiado já exige sessão de administrador; não houve mudança nesse fluxo.
- A suíte PostgreSQL executou 62 testes com sucesso (33 de indexação e 29 de documentos/relações/busca/sugestões); um caso que exige IA real foi ignorado.
- Tipagem e suíte padrão do backend aprovadas: 24 testes passaram, 20 condicionais foram ignorados sem banco.
- Os quatro testes de navegador autenticado passaram; o OpenAPI foi validado. Bancos e logs temporários foram removidos.
- As correções ainda não foram commitadas ou enviadas ao GitHub.

## Nova revisão — caracteres Unicode no processamento de documentos

### Média — trechos válidos com emojis são rejeitados pelo backend

**Código:** `backend/src/modules/documents/document-ingestion.ts`, validação `candidate.text.length > 1000`; `ai-service/services/chunker.py`, divisão em trechos de 1000 caracteres.

O Python conta pontos de código Unicode. JavaScript `String.length` conta unidades UTF-16; emojis e outros caracteres fora do plano básico ocupam duas unidades. Assim, um trecho que respeita o limite Python pode ultrapassar o limite JavaScript.

**Reprodução:** executar o chunker Python real da imagem de IA sobre texto com emojis e encaminhar sua saída ao cliente real de ingestão do backend, com escopo, metadados e vetor válidos. Apenas o transporte HTTP e os embeddings foram simulados.

```json
{"case":"unicode_document","python_codepoints":1000,"js_length":1125,"actual_error":"DOCUMENT_PROCESSING_INVALID","ascii_control":"passed"}
```

Um controle com 1000 caracteres ASCII passou. O trecho Unicode válido foi recusado. No worker, essa recusa deixa o documento em falha em vez de concluir sua indexação.

**Correção indicada:** alinhar a unidade de contagem do limite no backend ao chunker Python, preservando o limite de 1000 pontos de código e os demais checks. Adicionar controles para textos Unicode válidos e trechos realmente acima do limite.

**Estado:** corrigido localmente. A validação agora conta pontos de código Unicode, como o Python. O script e o servidor temporários foram removidos; nenhum dado de desenvolvimento foi alterado. A correção de autorização da busca permanece local e preservada.

### Média — ingestão de documentos aceitava embeddings nulos

O cliente de ingestão verificava dimensão e valores finitos, mas aceitava um vetor de 1024 zeros. O callback de chunks também não rejeitava esse vetor. Um vetor nulo não possui direção útil para a similaridade por cosseno usada na busca.

**Reprodução antes da correção:** uma resposta de processamento com texto, metadados e 1024 zeros foi aceita pelo cliente; a regressão que esperava rejeição falhou com `Missing expected rejection`. A proteção existente no worker de relatórios não abrangia o caminho de documentos.

**Corrigido localmente:** o cliente e o callback rejeitam vetores inteiramente zerados. A regressão HTTP comprova resposta 400 e preservação dos chunks anteriores.

## Validação das novas correções

- Seis regressões de ingestão: ASCII/Unicode no limite, texto misto, ASCII/Unicode acima do limite e embedding nulo.
- As regressões demonstraram três falhas antes da correção (dois textos Unicode válidos rejeitados e vetor nulo aceito); passaram depois.
- Tipagem aprovada; suíte padrão com 30 testes aprovados e 20 condicionais ignorados sem banco.
- PostgreSQL isolado: 63 testes aprovados (33 de indexação e 30 de documentos/relações/busca/sugestões), um caso ignorado por exigir IA real.
- A inspeção complementar de chunking, limites de upload/processamento e worker de relatórios não confirmou outra falha nesta rodada. Não é uma garantia de ausência total de defeitos.
- Banco e logs temporários removidos. Sem commit ou envio ao GitHub nesta etapa.

## Revisão de cadastro administrativo

### Média — criar PO substitui a sessão do administrador

**Código:** `backend/src/modules/auth/auth.service.ts:216` e `backend/src/modules/auth/auth.controller.ts:66`.

O cadastro privilegiado corretamente exige administrador, mas o fluxo de registro cria uma sessão para a nova conta e a devolve no mesmo cookie usado pela sessão atual. Isso autentica o navegador como o usuário recém-criado.

**Reprodução HTTP real em PostgreSQL temporário:** autenticar administrador; confirmar acesso a estatísticas; cadastrar um PO enviando o cookie do administrador; aplicar o Set-Cookie da resposta, como o navegador faz; consultar a sessão e o painel administrativo.

```json
{"case":"admin_registers_po","before":200,"registration":201,"session_role_after":"po","admin_panel_after":403}
```

**Impacto:** a criação termina com sucesso, mas o administrador passa a navegar como o novo PO e perde o acesso administrativo até autenticar novamente. A conta original não foi rebaixada; o problema é a troca involuntária da sessão.

**Correção indicada:** separar provisionamento administrativo de login automático no cadastro. Criar outra conta não deve emitir cookie que substitua a sessão do administrador. Manter os controles de papel já existentes.

O achado também constava no documento local anterior `REVISAO-CONSOLIDADA-2026-09-28.md`; nesta rodada foi confirmado contra a implementação atual por HTTP, em vez de assumir que o relato antigo continuava válido.

**Estado:** corrigido localmente. Cadastro com sessão válida não emite sessão/token para a nova conta e preserva o cookie atual. Cadastro público de dev mantém login automático. Banco, contas e scripts temporários removidos. As correções locais anteriores foram preservadas.

### Baixa — cadastros concorrentes retornavam erro de projeto duplicado

Dois pedidos simultâneos para o mesmo e-mail podiam passar pela consulta inicial antes da inserção. A restrição única impedia a duplicata, mas o erro era tratado pelo middleware genérico como `UNIQUE_VIOLATION` com mensagem de projeto duplicado.

**Reprodução:** duas requisições reais com barreira na consulta inicial de e-mail. Uma criou a conta; a outra retornou 409 com código incorreto. O teste de `EMAIL_EXISTS` falhou antes da correção.

**Corrigido localmente:** o serviço trata especificamente a restrição `usuario_email_key` como conflito de cadastro. Outros erros de banco continuam sendo propagados. A segunda tentativa retorna `EMAIL_EXISTS`; apenas uma conta é criada.

### Regressões do cadastro

- Administrador cria PO/admin/dev sem trocar sessão, sem retornar token da outra conta e sem criar sessão desnecessária para ela.
- A sessão original continua administradora e acessa o painel após cadastrar as contas.
- Visitantes e desenvolvedores continuam impedidos de criar PO/admin.
- Cadastro público de dev continua emitindo cookie/token para login automático.
- Cadastros simultâneos do mesmo e-mail retornam 201 e 409/EMAIL_EXISTS.
- Validação final: tipagem e OpenAPI aprovados; 30 testes padrão do backend, 68 integrados com PostgreSQL e quatro de navegador aprovados. Um caso integrado que exige IA real permanece ignorado. Dados e logs temporários removidos; alterações ainda locais, sem commit/envio.

## Revisão de falhas parciais do cadastro

### Média — erro na criação da sessão deixa cadastro parcialmente concluído

**Código:** `backend/src/modules/auth/auth.service.ts`, método `register`: `createUser` e `createSession` são gravações independentes.

**Reprodução:** no PostgreSQL temporário, instalar um trigger de teste que recusa inserções em `sessao`; enviar cadastro público válido; remover a falha simulada; repetir o mesmo cadastro.

```json
{"case":"partial_registration","first_status":500,"user_saved":1,"retry_status":409,"retry_code":"EMAIL_EXISTS"}
```

A primeira resposta informa erro interno, mas a conta já foi persistida. Repetir o cadastro após recuperar o serviço não conclui o fluxo: o e-mail já está ocupado pela tentativa anterior. O usuário pode usar o login quando a criação de sessão voltar a funcionar; não houve perda da conta.

**Correção indicada:** tornar criação da conta e sessão inicial atômicas, ou tratar explicitamente o sucesso do cadastro com falha de autenticação e orientar o login. Não remover contas por compensação insegura em operações concorrentes.

**Estado:** corrigido localmente. O repositório grava a conta e a sessão inicial na mesma transação/conexão. O serviço gera o token aleatório e encaminha somente seu hash para persistência. Cadastros administrativos continuam sem criar sessão para a nova conta.

**Regressão:** um trigger PostgreSQL recusa a sessão apenas para o e-mail de teste. A API retorna erro sem Set-Cookie e não deixa a conta salva. Depois de remover o trigger, a mesma solicitação retorna 201, com uma conta, uma sessão e token aceito por `/auth/me`. Não há exclusão compensatória de contas.

O banco, o trigger, a função e os arquivos temporários foram removidos. A regressão permanece na suíte automática de cadastro. As correções locais anteriores foram preservadas.

## Revisão de permissões do RepoAnalyzer

### Média — API permite ações de desenvolvedor bloqueadas pela interface

**Código:** `backend/src/modules/repo-analyses/repo-analyses.routes.ts`, criação e controles pause/resume/cancel; `frontend/src/views/projects/ProjectDetail.tsx`, permissão `canStart={canCreate && !archived}`.

A interface restringe início e controles aos papéis de escrita. A API valida sessão e acesso ao projeto, mas não aplica a mesma restrição de papel nessas ações. Aprovação e reprocessamento do relatório já exigem PO/admin.

**Reprodução HTTP real:** criar PO e desenvolvedor alocado no mesmo projeto; iniciar uma análise com o PO, ainda na fila; cancelar essa análise com a sessão do desenvolvedor; iniciar outra análise com o desenvolvedor.

```json
{"case":"analysis_role_mismatch","dev_cancel_po_analysis":200,"cancelled_state":"cancelada","dev_start_analysis":201}
```

As operações alteraram o banco, sem chamar o serviço externo. Isso confirma a divergência de autorização entre interface e API; não houve acesso entre projetos distintos.

**Correção indicada:** alinhar a API à restrição PO/admin da interface para criação, pausa, retomada e cancelamento. Se o produto optar por permitir controles a desenvolvedores, documentar essa decisão e alinhar a interface; não manter políticas divergentes.

**Estado:** corrigido localmente. O middleware compartilhado `requireRole('admin','po')` protege início, pausa, retomada e cancelamento antes da chamada ao serviço.

**Regressões:** matriz de papéis com testes HTTP de rotas confirma PO/admin autorizados, dev com 403 sem chamada de escrita, e leitura preservada para dev. Na aplicação real com PostgreSQL, o dev alocado não cria outra análise nem altera a análise enfileirada do PO; o status e a quantidade de registros permanecem intactos. O PO ainda consegue cancelar e o dev ainda consulta a análise.

Dados, banco e scripts temporários removidos. As correções locais anteriores foram preservadas.

Validação final desta correção: tipagem e OpenAPI aprovados; 31 testes padrão do backend e 70 integrados com PostgreSQL aprovados. Um caso integrado que exige IA real permanece ignorado. Sem commit ou envio nesta etapa.
