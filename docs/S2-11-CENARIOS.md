# S2-11: Sugestão de cenários de aceitação

Implementa o [PBI-03.1.3](backlog/EP-03-apoio-inteligencia-artificial.md) (Sugerir cenários de aceitação) sobre o harness da S2-09 e o painel da S2-10.

## Entrega

Na edição de um PBI, o painel **Apoio à especificação** ganhou o modo **Sugerir cenários**. Ele usa a operação `cenarios` do modo `levantamento`, que já existia no contrato da S2-09 sem uso na interface.

| Critério do PBI | Como é atendido |
| --- | --- |
| 1. Sugerir a partir da história | Cada sugestão traz nome, tipo, DADO, QUANDO e ENTÃO. A tela mostra os cenários em lista e cada um tem o botão **Usar no editor**. |
| 2. Caminho principal e acesso não autorizado | Toda resposta com cenários precisa ter ao menos um `caminho_principal`. Se a história ou as regras do PBI citarem uma expressão de `rules.permission_terms` (por exemplo "sem permissão", "perfil de acesso", "somente o proprietário"), a resposta também precisa ter um `acesso_nao_autorizado`, e o ENTÃO desse cenário precisa descrever a recusa. O backend recusa a resposta que não cumpre isso. |
| 3. Exigir história completa | Sem COMO UM, EU QUERO ou PARA QUE, a tela informa quais blocos faltam e não consulta a IA. O backend aplica a mesma regra: responde 400 `HISTORIA_INCOMPLETA` com `details.campos` e não chama o modelo. |

O modo só aparece na edição de um PBI existente e para quem pode editar os cenários. Na criação do PBI ainda não existe onde salvar um cenário, então o modo fica oculto.

## Do cenário sugerido ao cenário salvo

**Usar no editor** copia nome, DADO, QUANDO e ENTÃO para o formulário de cenário da seção **Cenários do PBI** e leva o foco até ele. Nada é gravado nesse momento: o PO revisa, ajusta e salva pelo fluxo normal, que já cuida da justificativa em item concluído e do registro de auditoria.

- Se o formulário já tiver um cenário sendo digitado, ele não é sobrescrito. O painel avisa para salvar ou cancelar esse cenário antes.
- Salvar um cenário sugerido não apaga as outras sugestões, para que o PO possa aproveitar várias de uma vez. Editar os campos do PBI continua descartando a resposta, porque ela deixa de corresponder ao texto atual.
- As sugestões não usam a tabela de sugestões da S2-13: ela trata de campos do item, e cenários são registros próprios.

## Contrato

A operação continua sendo `POST /api/v1/projects/{projectId}/ai/requests` com `mode: levantamento` e `operation: cenarios`, somente para `level: pbi`. Mudanças no contrato da S2-09:

- Cada item de `scenarios` passou a ter `nome` (até 255 caracteres, o limite do critério de PBI) e `tipo` (`caminho_principal`, `acesso_nao_autorizado` ou `alternativo`).
- `rules` ganhou `permission_terms`. A lista é versionada com o restante da configuração do modo. Revisões salvas antes desta entrega não têm a lista e passam a usar o padrão do código, sem migration.
- A instrução padrão de `cenarios` foi detalhada. Revisões já salvas mantêm a instrução que tinham.

O serviço de IA limita a resposta a entre 1 e 8 cenários, reforça no prompt o cenário de acesso não autorizado quando a história envolve permissão e usa um orçamento de 2.048 tokens para essa operação. A detecção de permissão considera apenas título, história e regras do PBI, nunca o contexto de edição. O [OpenAPI](api/openapi.yaml) foi atualizado.

### Limites das verificações

As duas verificações são lexicais, não semânticas:

- **Detecção de permissão:** a lista padrão usa expressões de autorização, não palavras soltas. "Perfil" ou "administrador" sozinhos também aparecem como dado do domínio ("consultar o perfil público", "cadastrar um administrador"), por isso só "perfil de acesso" e "perfil de administrador" contam. Uma história que exige permissão com outras palavras não é detectada; nesse caso, o administrador acrescenta a expressão em `permission_terms`.
- **Cenário de acesso não autorizado:** o backend confere que o ENTÃO descreve uma recusa (recusa, negado, bloqueado, não é permitido, permanece inalterado, mensagem de erro ou de permissão...). Isso impede um cenário marcado como recusa que termina em sucesso, mas não garante que a regra de permissão proposta esteja correta. A revisão do PO antes de salvar continua necessária.

## Testes e evidências

| Etapa | Evidência |
| --- | --- |
| Backend | 353 testes passaram, 0 falhas. Novos testes cobrem cenário nomeado e tipado, exigência de caminho principal e de acesso não autorizado, "perfil" e "administrador" como dado do domínio sem exigir permissão, acesso não autorizado com ENTÃO de sucesso recusado, termos de permissão fora da história ignorados, termos de implementação recusados, história incompleta sem chamar o modelo e revisão antiga sem `permission_terms` |
| Serviço de IA | 17 testes do harness passaram, incluindo schema com 1 a 8 cenários, reforço de permissão no prompt e orçamento de tokens |
| Interface | 292 testes passaram. Novos testes cobrem o modo visível só com editor disponível, envio da história e dos cenários salvos, tipos exibidos, cópia para o editor, bloqueio local e recusa do backend por história incompleta, preservação das sugestões ao salvar e formulário em edição não sobrescrito |
| API, PostgreSQL e IA em containers | O script `npm run test:integration:harness` ganhou a verificação da S2-11 (400 sem chamar o modelo e cenários com caminho principal e acesso não autorizado). Ele roda no CI; não foi executado localmente por falta de Docker na máquina de desenvolvimento |

Assim como na S2-10, os testes usam respostas simuladas do modelo: verificam contrato, regras e preservação da edição, não a qualidade semântica do Ollama real.

Pendências para fechar o card:

- capturas de tela da sugestão de cenários (`docs/evidence/S2-11-*.png`) com o modelo local;
- revisão do PR por outra pessoa.
