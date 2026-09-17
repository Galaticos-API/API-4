# PRE-05 — Design system e protótipo navegável

Artefatos de design para o habilitador **PRE-05**. Este material é uma referência inicial para
alinhar a Sprint 1 e liberar as tarefas de frontend dependentes; não substitui a validação com a
PRO4TECH nem representa a especificação visual definitiva do produto.

## Fonte de verdade do protótipo atual

- HTML navegável: [`06-prototipo-navegavel-garakis.html`](06-prototipo-navegavel-garakis.html)
- Figma consolidado: [Sinapse — PRE-05 · Protótipo e Design System](https://www.figma.com/design/qwALFr6yeP0fyOkLo6GiUB/Sinapse-%E2%80%94-PRE-05-%C2%B7-Prot%C3%B3tipo-e-Design-System?node-id=1-2)
- Página Figma: `PRE-05 — Protótipo e Design System` (oito telas na mesma página)

## Conteúdo da pasta

| Arquivo | Papel | Situação |
| --- | --- | --- |
| `06-prototipo-navegavel-garakis.html` | Protótipo de referência atual, com rotas e telas revisadas | Usar para desenvolvimento e revisão |
| `05-modulos-ia-e-ingestao.html` | Mapa conceitual de Documentos, Conhecimento e Conversa | Material complementar |
| `04-design-system-garakis.html` | Tokens e componentes inspirados na base Garakis autorizada | Referência visual |
| `GUIA_UX_HEURISTICAS_NIELSEN.md` | Critérios de experiência e heurísticas por tela | Referência de UX |
| `PLANO_ARQUITETURA_TELAS.md` | Arquitetura de domínio, telas e relações | Referência de produto/arquitetura |
| `TUTORIAL_FIGMA.md` | Instruções de importação manual | Operação |
| `01-wireframes.html`, `02-design-system.html`, `03-prototipo-sprint-1.html` | Explorações anteriores | Histórico; não usar como fonte principal |

## Escopo visual atual

`Projeto → Backlog / Documentos / Decisões → Acervo indexado → Busca e Conversa`

- **Projetos** são o contexto de trabalho.
- **Backlog** apresenta a hierarquia `Projeto → Épico → Feature → PBI`.
- **Documentos** pertencem a um projeto e só passam a alimentar o acervo após processamento.
- **Conhecimento** é busca no conteúdo já indexado; não é área de upload.
- **Conversa** consulta o acervo com escopo persistente, fontes verificáveis e histórico lateral próprio.
- **Carga inicial do acervo** é uma operação administrativa, separada do envio de documentos do projeto.

## Limites desta entrega

- As interações são demonstrativas e não persistem dados.
- IA, busca, upload e processamento são representações de interface das Sprints 2 e 3.
- O script de captura do Figma existe apenas para facilitar a importação dos HTMLs.
- O visual deve ser revisado após retorno formal da PRO4TECH e implementação dos componentes reais.

## Como revisar localmente

```bash
cd figma-import
python3 -m http.server 4173
```

Abra `http://127.0.0.1:4173/06-prototipo-navegavel-garakis.html`.

## Pronto para commit

Este diretório deve ser enviado integralmente no commit do PRE-05. Não incluir capturas
temporárias, arquivos em `/tmp`, nem artefatos exportados do navegador.
