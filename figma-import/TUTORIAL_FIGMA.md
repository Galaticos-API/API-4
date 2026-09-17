# Como importar os HTMLs no Figma

Os arquivos foram feitos como páginas HTML autocontidas: cada tela está em uma seção (`.frame`)
de 1440 px, sem imagens, scripts ou dependências externas. Isso torna a importação mais
previsível em plugins que convertem HTML em camadas editáveis.

1. No Figma, crie ou abra o arquivo destinado ao design do Sinapse.
2. Abra **Resources** (`Shift` + `I`), procure o plugin de importação HTML disponível no time
   e execute-o. Exemplos comuns são “HTML to Figma” e “Builder.io HTML to Figma”.
3. Escolha a opção de importar por **arquivo** ou cole o conteúdo do HTML — use um arquivo por
   vez. Comece por `04-design-system-garakis.html`; depois importe
   `03-prototipo-sprint-1.html` e `05-modulos-ia-e-ingestao.html`.
4. Quando o plugin perguntar pela largura, mantenha **1440 px** para as pranchas desktop.
   Para o wireframe, importe `01-wireframes.html` em uma página separada.
5. No painel Layers, renomeie o frame raiz conforme o `data-name` da tela e mova as pranchas
   para as páginas `Wireframes`, `Design system`, `Sprint 1` e `IA & ingestão`.
6. Revise a tipografia. Os arquivos usam `Public Sans` em títulos e `Inter` no conteúdo;
   caso o plugin não as reconheça, instale/habilite essas fontes no Figma ou substitua por
   uma fonte aprovada pelo time.
7. Conecte as interações no modo **Prototype**. No HTML de Sprint 1, as relações já estão
   sinalizadas pela sequência: Login → Projetos → Cadastro → Hierarquia → PBI. No arquivo
   de IA, a sequência é Importação → Upload/embeddings → Chat.

## Arquivos recomendados

| Ordem | Arquivo | Página no Figma |
| --- | --- | --- |
| 1 | `04-design-system-garakis.html` | Design system |
| 2 | `01-wireframes.html` | Wireframes |
| 3 | `03-prototipo-sprint-1.html` | Sprint 1 |
| 4 | `05-modulos-ia-e-ingestao.html` | IA & ingestão |

Se o importador não aceitar arquivos locais, abra o HTML no navegador, copie o conteúdo-fonte
e use a opção **Import from code / Paste HTML** do próprio plugin. A aparência é preservada,
mas elementos podem chegar como grupos ou vetores dependendo do importador; nesse caso,
converta os controles recorrentes em componentes do Figma após a importação.
