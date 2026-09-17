# Plano de esclarecimento — arquitetura de telas do Sinapse

## Decisão de domínio

O produto tem quatro conceitos distintos, que não devem competir como se fossem módulos equivalentes:

`Projeto → Itens de trabalho / Documentos / Decisões → Acervo indexado → Chat`

- **Projeto** é o contexto organizacional: cliente, descrição, status e tudo que pertence àquela iniciativa.
- **Itens de trabalho** são o backlog daquele projeto, na hierarquia `Projeto → Épico → Feature → PBI`.
- **Documentos** são anexos de um projeto (ou, no caso de protótipos, de um PBI). Eles não existem como coleção global independente.
- **Acervo** é uma projeção de consulta: reúne automaticamente documentos processados, itens concluídos e decisões, preservando projeto e origem. Não é outro lugar para cadastrar o mesmo conteúdo.
- **Chat** é uma forma de consultar o acervo. A conversa guarda escopo, histórico e fontes; não cria uma segunda base de documentos.

## Navegação global proposta

Na Sprint 1, a barra superior deve conter somente o que existe funcionalmente:

1. **Projetos** — lista, criação e acesso ao detalhe.
2. **Backlog** — visão transversal ou atalho para o backlog do projeto em contexto.

Itens futuros devem entrar progressivamente, sem antecipar telas que ainda não possuem capacidade entregue:

3. **Conhecimento** (Sprint 2) — busca no acervo; também pode ser acessado por uma aba do projeto.
4. **Conversa** (Sprint 3) — chat sobre o acervo, com o histórico lateral exclusivo desta tela.
5. **Administração** — acesso por menu do usuário e condicionado à permissão.

“Documentos” não deve ser item global do menu. “Importar acervo” também não: é uma operação administrativa de carga inicial, não uma área de trabalho recorrente do usuário final.

## Mapa de telas

| Área | Tela | Responsabilidade | Relação |
| --- | --- | --- | --- |
| Projetos | Lista de projetos | Localizar, filtrar e criar projetos | Entrada principal do produto |
| Projetos | Criar projeto | Nome, cliente e descrição; validar duplicidade | Após criar, abre detalhe do projeto |
| Projeto | Visão geral | Contexto, indicadores e atividade recente | Contém as abas abaixo |
| Projeto | Backlog | Navegar por Épicos, Features e PBIs | Cada item abre o detalhe correspondente |
| Item | Detalhe/edição | Campos próprios do nível, qualidade, decisões e rastreabilidade | PBI pode ter anexos visuais |
| Projeto | Documentos | Enviar, listar, acompanhar processamento e remover anexos | Alimenta o acervo automaticamente |
| Conhecimento | Busca | Recuperar itens, documentos e decisões por texto/semântica | Mostra origem e abre a fonte |
| Conversa | Chat | Perguntar sobre o acervo no escopo escolhido | Histórico lateral; fontes levam ao item/documento |
| Administração | Carga inicial | Curar e importar API-1, API-2 e API-3 | Excepcional; não pertence ao fluxo diário |

## Fluxos principais

### Especificar backlog

`Projetos → Detalhe do projeto → Backlog → Épico → Feature → PBI`

Ao concluir ou alterar um item, o sistema registra rastreabilidade e atualiza sua representação no acervo. A edição deve continuar viável sem IA.

### Preservar conhecimento

`Projeto → Documentos → Upload → Processamento → Acervo`

Itens de trabalho e decisões também entram no acervo automaticamente. A listagem de documentos mostra o estado do arquivo; a busca e o chat mostram o conhecimento recuperável, nunca uma cópia desconectada do arquivo original.

### Consultar conhecimento

`Conhecimento (busca) ou Conversa → selecionar escopo → resposta/resultado → fonte → item ou documento de origem`

O escopo pode ser um projeto ou toda a base, deve permanecer visível e restringe o conteúdo recuperado. O chat precisa declarar ausência de evidência e citar somente fontes efetivamente utilizadas.

## Decisões de UX para o protótipo

- Transformar a tela atual “Itens de trabalho” em uma aba de **Backlog** dentro do detalhe de projeto; manter uma visão transversal opcional no menu global.
- Mover a tela atual “Documentos” para a aba **Documentos** do projeto e manter o projeto selecionado sempre visível no breadcrumb.
- Renomear “Importar acervo” para **Carga inicial do acervo** e movê-la para Administração, com acesso restrito a administradores.
- Tratar “Acervo” como busca/consulta. A tela não deve oferecer upload nem criar documentos.
- Manter a lista de chats no lado esquerdo somente na rota de Conversa, como solicitado; ela representa histórico privado do usuário, não navegação global.
- Fazer fontes do chat abrirem o detalhe de PBI, épico, feature ou documento, conforme a origem.

## Sequência de implementação

1. Sprint 1: Projetos, detalhe de projeto, Backlog, detalhe de item e aba Documentos.
2. Sprint 2: processamento, estado de indexação, busca no acervo e copiloto dentro do editor de item.
3. Sprint 3: Conversa, histórico, escopo, fontes navegáveis, perfis e administração.

## Pontos a validar com a PRO4TECH

1. A pendência Q4 já aparece resolvida na especificação de `PBI-01.1.1`: existe Projeto acima de Épico. Confirmar a decisão formalmente para fixar a navegação.
2. Confirmar se a busca transversal precisa estar disponível no menu global já na Sprint 2 ou apenas dentro do contexto do projeto.
3. Definir quais perfis podem executar a carga inicial e o expurgo completo do acervo.
