# Guia UX — clareza de contexto e heurísticas de Nielsen

## Princípio central

O usuário não deve precisar deduzir onde está nem para onde seu conteúdo vai. Toda tela deve responder, visualmente e antes de qualquer ação:

1. **Em que contexto estou?** (organização, projeto ou toda a base)
2. **O que posso fazer aqui?**
3. **O que acontecerá com esta informação?**
4. **Como volto ou verifico a origem?**

### Linguagem de navegação

| Termo | Significado visível para o usuário | Não deve significar |
| --- | --- | --- |
| Projetos | Espaços de trabalho de clientes/iniciativas | Documentos globais |
| Backlog | Épicos, Features e PBIs do projeto selecionado | Arquivos ou conversas |
| Documentos | Arquivos anexados ao projeto selecionado | Conhecimento pesquisável por si só |
| Conhecimento | Busca no conteúdo já processado do acervo | Local de upload |
| Conversa | Perguntas ao acervo, com fontes e escopo | Chat genérico sem evidência |

## Regras globais de interface

- A barra superior mostra a área atual. O item ativo tem texto e fundo diferentes, não depende somente da cor.
- Sempre que a pessoa estiver dentro de um projeto, mostrar breadcrumb fixo: `Projetos / [Nome do projeto] / [Área]`.
- Um selo de contexto no topo informa `Projeto: Portal do Cliente` ou `Escopo: Toda a base`.
- Ações de criação usam verbos claros: `Criar projeto`, `Adicionar épico`, `Enviar documento`; evitar o genérico `Salvar` sem contexto.
- Ações destrutivas exigem confirmação, mostram impacto e oferecem saída segura.
- Estados vazios explicam a causa, o próximo passo e o resultado da ação.

## Aplicação por tela

| Tela | Clareza necessária | Heurísticas de Nielsen aplicadas |
| --- | --- | --- |
| Lista de projetos | Deixar evidente que é a porta de entrada e que cada card é um contexto isolado | 1 Visibilidade: contadores e status; 2 Mundo real: nome do cliente/projeto; 3 Controle: filtro e retorno; 4 Consistência: mesmo padrão de cards |
| Criar projeto | Explicar os campos e impedir ambiguidade de nome | 5 Prevenção de erro: validar nome obrigatório/duplicado antes de criar; 9 Recuperação: mensagem ao lado do campo; 6 Reconhecimento: exemplos de objetivo e cliente |
| Visão geral do projeto | Confirmar persistentemente o projeto ativo e apresentar as áreas pertencentes a ele | 1 Visibilidade: status/atividade; 6 Reconhecimento: abas Backlog e Documentos; 8 Minimalismo: somente resumo e próximos passos |
| Backlog do projeto | Explicitar a hierarquia e o pai de cada item | 2 Mundo real: termos do guia PRO4TECH; 4 Consistência: Projeto → Épico → Feature → PBI; 7 Eficiência: filtro, busca e atalho para criação; 1 Visibilidade: rascunho/concluído/arquivado |
| Detalhe de item | Separar campos próprios de Épico, Feature e PBI e mostrar qualidade em tempo real | 5 Prevenção: bloquear conclusão incompleta, não rascunho; 1 Visibilidade: checklist de conformidade; 9 Recuperação: indicar campo e correção; 3 Controle: descartar ou manter rascunho |
| Documentos do projeto | Tornar explícito que o arquivo pertence ao projeto exibido e informar seu ciclo de processamento | 1 Visibilidade: aguardando/processando/processado/falhou; 2 Mundo real: nome, tipo, autor, data e tamanho; 5 Prevenção: tipo e limite antes do envio; 9 Recuperação: motivo da falha e `Tentar novamente` |
| Carga inicial do acervo | Distinguir importação administrativa de upload normal e comunicar seleção/risco | 2 Mundo real: origem API-1/2/3; 5 Prevenção: lista explícita do que será excluído (código, anexos de teste); 3 Controle: revisão antes da confirmação; 1 Visibilidade: progresso e relatório final |
| Busca no conhecimento | Explicar que pesquisa conteúdo indexado, não arquivos em tempo real, e manter a origem visível | 1 Visibilidade: filtros/escopo/resultados; 6 Reconhecimento: tipo e projeto da fonte; 7 Eficiência: filtros por projeto, nível e status; 10 Ajuda: explicar indexação e estados sem resultado |
| Conversa | Fixar o escopo, mostrar fontes navegáveis e distinguir conversa de busca | 1 Visibilidade: selo de escopo persistente e estado de resposta; 3 Controle: trocar escopo e iniciar conversa; 9 Recuperação: indisponibilidade preserva a pergunta; 10 Ajuda: informar limites da base; 6 Reconhecimento: histórico com título, data e escopo |

## Padrões obrigatórios para feedback

| Situação | Resposta da interface |
| --- | --- |
| Documento enviado | `Arquivo enviado para Portal do Cliente. Processamento iniciado.` |
| Documento processado | `Pronto para busca e conversa neste projeto.` |
| Resultado fora do escopo do chat | `Não encontrei evidência em Portal do Cliente. Buscar em Toda a base?` |
| Chat sem evidência | `Não encontrei informação suficiente no acervo selecionado.` Sem resposta especulativa. |
| PBI incompleto | `Rascunho salvo. Faltam 2 campos obrigatórios para concluir este PBI.` |
| Exclusão de documento | Modal com nome, projeto, impacto no índice e opção explícita `Remover documento e conteúdo indexado`. |

## Critérios de aceite de UX para o protótipo

1. Em teste de cinco segundos, participantes identificam o projeto ativo na tela de Backlog e Documentos.
2. Participantes distinguem, sem ajuda, `Enviar documento ao projeto` de `Carregar acervo inicial`.
3. Participantes entendem que o chat responde apenas usando o escopo e conseguem alterar esse escopo.
4. Ao abrir uma fonte do chat, participantes chegam ao documento ou item correto e veem seu projeto de origem.
5. Em estados vazios, participantes conseguem concluir a primeira ação sem recorrer a ajuda externa.
6. Nenhuma ação crítica depende apenas de ícone, cor ou memória do usuário.

## Ajustes prioritários no HTML atual

1. Inserir breadcrumb e selo do projeto em Backlog, PBI e Documentos.
2. Tirar `Documentos` e `Importar acervo` da navegação principal; o primeiro vira aba do projeto e o segundo, Administração.
3. Adicionar uma tela de Busca no conhecimento, distinta da tela Conversa.
4. Exibir no chat o seletor de escopo de forma persistente e oferecer ampliar para toda a base quando não houver evidência.
5. Fazer as fontes do chat navegarem ao item ou documento de origem.
