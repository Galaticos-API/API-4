# EP-02 — Preservar o conhecimento dos projetos

**Sprints:** 1 e 2 · **11 PBIs** · [← voltar ao índice](README.md)

## Descrição

Transformar tudo o que é produzido na plataforma — itens de trabalho, decisões e documentos
anexados — em um acervo consultável por significado, isolado por projeto e recuperável muito
depois de a especificação ter sido escrita. Afeta Product Owners, desenvolvedores e novos
integrantes da fábrica.

## Objetivo

Fazer com que o conhecimento gerado durante a especificação deixe de depender da memória de
quem participou. Hoje soluções já construídas não são lembradas na hora de especificar algo
parecido, e o conhecimento se perde na rotatividade da equipe.

## Escopo macro

- Anexo de documentos ao projeto e de protótipos aos PBIs
- Processamento e indexação do conteúdo para consulta por significado
- Busca combinada por significado e por termo exato
- Isolamento e expurgo do contexto por projeto

## Resultado esperado

Ao especificar uma nova funcionalidade, o Product Owner consegue localizar em segundos o que a
fábrica já produziu sobre assunto semelhante, mesmo que tenha sido escrito por outra pessoa,
em outro projeto, anos antes.

## Critérios de aceitação

- Conteúdo de um projeto não deve aparecer em consultas restritas a outro projeto.
- Todo resultado de busca deve permitir chegar ao item de origem.
- A remoção do contexto de um projeto deve ser completa, sem deixar conteúdo recuperável no
  índice.
- A indexação não deve bloquear a interação do usuário: o cadastro é concluído
  independentemente do processamento.
- Buscas por termos exatos, como nomes de tecnologias e integrações, devem retornar
  correspondências precisas.

---

## FT-02.1 — Anexos e protótipos

**Sprint 1** · 4 PBIs

**Descrição.** Envio, listagem e remoção de documentos vinculados a um projeto e de protótipos
visuais vinculados a PBIs.

**Objetivo.** Trazer para dentro da plataforma o material que hoje circula solto em pastas e
conversas, vinculando-o ao contexto a que pertence.

**Critérios de aceitação**

- Todo anexo deve estar vinculado a um projeto, e todo protótipo a um PBI específico.
- Tipos de arquivo não suportados devem ser recusados com mensagem clara.
- O tamanho máximo por arquivo deve ser configurável e informado antes do envio.
- A remoção de um anexo deve exigir confirmação e registrar autor e data.

### PBI-02.1.1 — Anexar documento ao projeto · `Must`

COMO UM Product Owner
EU QUERO anexar documentos a um projeto
PARA QUE o material de referência fique junto do contexto a que pertence.

**Cenário 1 — Enviar documento suportado**
DADO que eu esteja na tela de um projeto
QUANDO eu enviar um arquivo PDF, DOCX, MD ou TXT
ENTÃO o sistema deve armazenar o arquivo vinculado ao projeto e registrar quem enviou e quando.

**Cenário 2 — Recusar tipo não suportado**
DADO que eu selecione um arquivo de tipo não suportado
QUANDO eu tentar enviá-lo
ENTÃO o sistema deve recusar o envio e informar os tipos aceitos.

**Cenário 3 — Recusar arquivo acima do limite**
DADO que o arquivo ultrapasse o tamanho máximo configurado
QUANDO eu tentar enviá-lo
ENTÃO o sistema deve recusar o envio e informar o limite.

**Cenário 4 — Tratar falha no envio**
DADO que ocorra uma falha durante o envio
QUANDO o erro for detectado
ENTÃO o sistema deve informar a falha e permitir nova tentativa sem perder a seleção do arquivo.

### PBI-02.1.2 — Consultar documentos do projeto · `Should`

COMO UM membro da equipe
EU QUERO consultar os documentos anexados a um projeto
PARA QUE eu saiba qual material de referência existe e em que estado está.

**Cenário 1 — Listar documentos**
DADO que o projeto possua documentos anexados
QUANDO eu abrir a aba de documentos
ENTÃO o sistema deve listá-los com nome, tipo, tamanho, autor do envio e data.

**Cenário 2 — Exibir status de processamento**
DADO que um documento esteja aguardando processamento
QUANDO eu visualizar a listagem
ENTÃO o sistema deve indicar o estado do processamento daquele documento.

**Cenário 3 — Tratar projeto sem documentos**
DADO que o projeto não possua documentos
QUANDO eu abrir a aba
ENTÃO o sistema deve orientar o envio do primeiro documento.

### PBI-02.1.3 — Anexar protótipo ao PBI · `Should`

COMO UM Product Owner
EU QUERO anexar um protótipo ou referência visual a um PBI
PARA QUE o comportamento com interface relevante fique mais claro para quem implementa.

**Cenário 1 — Anexar imagem ao PBI**
DADO que eu esteja editando um PBI
QUANDO eu anexar um arquivo PNG, JPG ou PDF com uma legenda
ENTÃO o sistema deve vincular o protótipo ao PBI e exibi-lo na visualização do item.

**Cenário 2 — Alertar sobre protótipo sem cenários**
DADO que o PBI possua protótipo anexado e nenhum cenário de aceitação
QUANDO o sistema avaliar a qualidade do item
ENTÃO ele deve alertar que o protótipo não substitui os critérios escritos.

**Regras e observações.** O guia é explícito: elementos visuais não registram todas as regras
de negócio, exceções e estados de erro. O alerta do cenário 2 implementa a verificação
correspondente do checklist.

### PBI-02.1.4 — Remover anexo · `Should`

COMO UM Product Owner
EU QUERO remover um anexo enviado por engano ou desatualizado
PARA QUE o acervo não acumule material que induza a erro.

**Cenário 1 — Remover documento**
DADO que eu esteja visualizando um documento anexado
QUANDO eu solicitar a remoção e confirmar
ENTÃO o sistema deve remover o arquivo e registrar autor e data da remoção.

**Cenário 2 — Remover conteúdo indexado junto**
DADO que o documento já tenha sido processado e indexado
QUANDO eu confirmar a remoção
ENTÃO o sistema deve remover também o conteúdo correspondente do índice de busca.

---

## FT-02.2 — Indexação do acervo

**Sprint 2** · 4 PBIs

**Descrição.** Processamento do conteúdo — itens de trabalho, decisões e documentos — para que
se torne recuperável por significado, mantendo o vínculo com o projeto de origem.

**Objetivo.** Fazer com que o acervo se construa como efeito colateral do trabalho normal, sem
exigir do Product Owner nenhuma ação adicional de catalogação.

**Critérios de aceitação**

- Todo conteúdo indexado deve carregar o identificador do projeto de origem.
- A indexação de itens de trabalho deve ocorrer automaticamente ao concluir a edição.
- Falhas de processamento devem ser visíveis e permitir nova tentativa.
- A alteração de um item deve atualizar o índice sem duplicar conteúdo.

### PBI-02.2.1 — Processar documento anexado · `Must`

COMO UM Product Owner
EU QUERO que o documento que anexei seja processado para consulta
PARA QUE seu conteúdo passe a ser encontrado nas buscas do acervo.

**Cenário 1 — Processar documento com sucesso**
DADO que eu tenha anexado um documento suportado
QUANDO o processamento for concluído
ENTÃO o sistema deve marcar o documento como processado e seu conteúdo deve passar a retornar
nas buscas do projeto.

**Cenário 2 — Preservar o vínculo com o projeto**
DADO que o documento tenha sido processado
QUANDO seu conteúdo for indexado
ENTÃO cada trecho indexado deve carregar o identificador do projeto de origem.

**Cenário 3 — Tratar falha de extração**
DADO que o conteúdo do arquivo não possa ser extraído
QUANDO o processamento falhar
ENTÃO o sistema deve marcar o documento com o estado de falha, informar o motivo e permitir
nova tentativa.

**Cenário 4 — Não bloquear o usuário**
DADO que eu tenha anexado um documento extenso
QUANDO o processamento estiver em andamento
ENTÃO eu devo poder continuar usando a plataforma normalmente.

### PBI-02.2.2 — Indexar item de trabalho automaticamente · `Must`

COMO UM membro da equipe
EU QUERO que os itens especificados entrem no acervo automaticamente
PARA QUE o conhecimento se acumule sem exigir catalogação manual.

**Cenário 1 — Indexar ao concluir**
DADO que eu conclua a edição de um item de trabalho
QUANDO o item for salvo
ENTÃO o sistema deve indexar seu conteúdo com os metadados de projeto, nível, status e
tecnologias associadas.

**Cenário 2 — Indexar decisões**
DADO que eu registre uma decisão em um item
QUANDO a decisão for salva
ENTÃO o sistema deve indexá-la vinculada ao item e ao projeto.

**Regras e observações.** Cada item de trabalho é indexado como uma unidade, sem fragmentação
por tamanho fixo: a granularidade semântica já é definida pelo guia da PRO4TECH.

### PBI-02.2.3 — Reindexar item alterado · `Should`

COMO UM membro da equipe
EU QUERO que alterações em um item se reflitam nas buscas
PARA QUE o acervo não devolva informação desatualizada.

**Cenário 1 — Atualizar o índice após edição**
DADO que um item já indexado seja alterado
QUANDO a alteração for salva
ENTÃO o sistema deve substituir o conteúdo indexado, sem manter a versão anterior nos
resultados.

**Cenário 2 — Remover do índice ao arquivar**
DADO que um item seja arquivado
QUANDO o arquivamento for concluído
ENTÃO seu conteúdo não deve mais retornar nas buscas de trabalho ativo.

### PBI-02.2.4 — Expurgar o contexto de um projeto · `Must`

COMO UM administrador
EU QUERO remover todo o conteúdo indexado de um projeto
PARA QUE eu possa refazer a carga ou atender a uma exigência de remoção de dados.

**Cenário 1 — Expurgar contexto**
DADO que eu esteja na administração de um projeto
QUANDO eu solicitar o expurgo do contexto e confirmar
ENTÃO o sistema deve remover todo o conteúdo indexado daquele projeto.

**Cenário 2 — Preservar os demais projetos**
DADO que o expurgo tenha sido concluído
QUANDO eu buscar conteúdo de outro projeto
ENTÃO os resultados desse outro projeto devem permanecer intactos.

**Cenário 3 — Exigir confirmação explícita**
DADO que a operação seja irreversível
QUANDO eu solicitar o expurgo
ENTÃO o sistema deve exigir a digitação do nome do projeto para confirmar.

---

## FT-02.3 — Busca no acervo

**Sprint 2** · 3 PBIs

**Descrição.** Consulta ao acervo combinando busca por significado e por termo exato, com
filtros e acesso ao item de origem.

**Objetivo.** Responder à pergunta que motivou o projeto — *"já fizemos algo parecido?"* —
mesmo quando quem pergunta não conhece o vocabulário usado por quem escreveu.

**Critérios de aceitação**

- A busca deve combinar correspondência por significado e por termo exato, apresentando um
  resultado único e ordenado por relevância.
- Nomes próprios de tecnologias e integrações devem retornar correspondências exatas.
- Todo resultado deve indicar o projeto de origem e permitir abrir o item completo.
- A busca deve responder em menos de dois segundos para o volume previsto.

### PBI-02.3.1 — Buscar por significado no acervo · `Must`

COMO UM Product Owner
EU QUERO buscar no acervo por significado
PARA QUE eu encontre trabalho semelhante mesmo sem saber os termos exatos usados.

**Cenário 1 — Encontrar por descrição aproximada**
DADO que exista no acervo um PBI sobre autenticação de usuários
QUANDO eu buscar por "login de cliente"
ENTÃO o sistema deve retornar esse item entre os resultados.

**Cenário 2 — Encontrar por termo exato**
DADO que exista no acervo conteúdo mencionando integração com PIX
QUANDO eu buscar por "PIX"
ENTÃO o sistema deve retornar esse conteúdo entre os primeiros resultados.

**Cenário 3 — Tratar ausência de resultados**
DADO que nenhum conteúdo corresponda à busca
QUANDO os resultados forem apresentados
ENTÃO o sistema deve informar a ausência de correspondências, sem sugerir resultados
irrelevantes.

**Regras e observações.** A combinação entre busca por significado e por termo exato é o que
sustenta o cenário 2: nomes próprios como PIX, WhatsApp e OAuth exigem correspondência
literal, na qual a busca puramente semântica é imprecisa.

### PBI-02.3.2 — Filtrar resultados da busca · `Must`

COMO UM Product Owner
EU QUERO restringir a busca a um recorte específico
PARA QUE eu consulte apenas o contexto que me interessa.

**Cenário 1 — Restringir a um projeto**
DADO que eu esteja buscando no acervo
QUANDO eu restringir a busca a um projeto
ENTÃO o sistema deve retornar apenas conteúdo daquele projeto.

**Cenário 2 — Filtrar por tecnologia e nível**
DADO que eu tenha uma busca ativa
QUANDO eu filtrar por tecnologia e por nível do item
ENTÃO o sistema deve aplicar os dois critérios simultaneamente.

**Cenário 3 — Impedir vazamento entre projetos**
DADO que a busca esteja restrita ao Projeto A
QUANDO existir conteúdo semelhante no Projeto B
ENTÃO o conteúdo do Projeto B não deve aparecer nos resultados.

### PBI-02.3.3 — Abrir o item de origem de um resultado · `Must`

COMO UM Product Owner
EU QUERO abrir o item completo a partir de um resultado de busca
PARA QUE eu leia a especificação inteira e não apenas o trecho encontrado.

**Cenário 1 — Exibir trecho e origem**
DADO que a busca retorne resultados
QUANDO eu visualizar a lista
ENTÃO cada resultado deve apresentar o trecho correspondente e o projeto de origem.

**Cenário 2 — Navegar até o item**
DADO que eu selecione um resultado
QUANDO a navegação ocorrer
ENTÃO o sistema deve abrir o item de trabalho ou o documento de origem, posicionado no trecho
correspondente.
