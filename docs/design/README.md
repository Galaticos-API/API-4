# Design System e protótipo — Sinapse

Corresponde ao habilitador `PRE-05`.

## O que está publicado

| | Link |
|---|---|
| Design System | https://claude.ai/code/artifact/ebe6e1a1-8f93-4831-a45e-cc5f81d796be |
| Protótipo navegável | https://claude.ai/code/artifact/5c9bc82a-813b-417e-ae01-df6265995476 |

O protótipo abre na **Conversa**, que é a entrada principal de dados: reunião,
transcrição e documento viram item de trabalho por ali. As outras duas abas são
**Backlog** (árvore com responsável e editor com o checklist do guia validando ao
vivo) e **Equipe** (papel, competências e tarefas de cada pessoa).

## Origem dos tokens

Cor, tipografia, raio e sombra foram lidos da folha de estilo do site da PRO4TECH
(`assets/css/main.css`), não aproximados visualmente:

| Token | Valor |
|---|---|
| Acento | `#ED6A32` · claro `#F1885B` |
| Superfícies | `#0B0D10` · `#111827` · `#171A21` |
| Texto | `#FFFFFF` · `#E5E7EB` · `#6B7280` |
| Raio | `10px` — a marca tem um só |
| Sombra | `0 1px 14px rgba(0,0,0,.13)` |
| Fontes | Public Sans (título) · Inter (interface) |

As quatro cores semânticas são a exceção: a PRO4TECH não publica cores de estado,
então foram derivadas do laranja em oklch, mantendo luminosidade (`0.676`) e croma
(`0.176`) e variando só o matiz.

Os tokens estão aplicados em [`frontend/src/index.css`](../../frontend/src/index.css).

## Arquivos deste diretório

Os `.dc.html` e o `canvas.json` são a fonte. Os `.html` de saída têm ~2,4 MB cada,
são regeneráveis e por isso ficam fora do versionamento.

Para alterar: edite o `.dc.html`, regere o canvas e republique no mesmo endereço.
Quem for mexer precisa do comando `/design` do Claude Code — ele traz o montador.

> A edição também pode ser feita direto na página publicada, sem passar por aqui.
> Nesse caso os arquivos deste diretório ficam defasados: regere a partir da versão
> publicada antes de editar por aqui de novo.
