# S2-10 — Questionador e padronizador na edição

## Entrega

A área **Apoio à especificação** está nos formulários de criação e edição de épico, feature e PBI. Usa o contrato versionado da S2-09, sem chamadas automáticas ao digitar.

- **Questionar lacunas** é o modo inicial dos PBIs. Mostra as perguntas agrupadas pelas seis dimensões do guia: caminho principal, validações, erros/indisponibilidade, permissões/segurança, estados alternativos e interface/compatibilidade. Uma resposta sem perguntas é apresentada como ausência de lacunas relevantes, sem acrescentar perguntas artificiais.
- **Padronizar texto** apresenta uma proposta com os campos do nível: descrição, objetivo, escopo macro e resultado esperado para épico; descrição e objetivo para feature; os três blocos da história e observações para PBI, além do título correspondente.
- A resposta é apresentada em área separada, identificada como proposta. Nenhum campo, item ou sugestão é gravado por essa ação. Descartar a resposta também não altera o item. Esta entrega apresenta texto para revisão; o ciclo de sugestões persistidas da S2-13 permanece separado.

O questionador recebe os valores atuais do formulário, o indicador de interface e os cenários já salvos do PBI. Os campos salvos que não aparecem na edição, como observações, também são preservados no contexto. Critérios ainda não salvos na seção de cenários não são considerados; a tela informa essa diferença. Enquanto a leitura dos critérios não terminar, a análise de lacunas fica indisponível. A padronização e a edição manual continuam disponíveis.

## Falhas e continuidade da edição

A solicitação da IA não bloqueia os campos nem o botão de salvar. Falha do serviço, erro de rede, timeout ou resposta incompatível mostram mensagem e permitem nova tentativa, preservando os valores atuais.

Ao editar um campo, trocar o modo ou sair da tela, a solicitação anterior é cancelada. Respostas tardias são ignoradas e propostas antigas são removidas para não serem confundidas com o texto atual. É possível cancelar manualmente uma análise em andamento.

Após 5 segundos aparece um aviso de demora. O limite pode ser configurado no build do frontend por `VITE_COPILOT_SLOW_NOTICE_MS` entre 1.000 e 60.000 ms; valores inválidos usam 5.000 ms. A requisição tem limite de 65 segundos no cliente, acima do máximo de 60 segundos permitido pelo harness. O serviço pode encerrar antes, conforme a configuração do modo.

O cliente recusa nível, operação ou schema incompatíveis, perguntas fora das seis dimensões e propostas com campos extras ou ausentes. Conteúdo maior que os 6.000 caracteres por campo aceitos pelo harness é recusado com mensagem, sem truncamento silencioso. Respostas são renderizadas como texto, sem executar HTML. Não foram adicionados logs ou armazenamento de rascunhos, prompts ou respostas.

## Contrato e dependência

A interface envia `POST /api/v1/projects/{projectId}/ai/requests` com `mode: levantamento` e `operation: questionar` ou `padronizar`. O projeto é o da tela em edição. Autenticação, permissão e acesso ao projeto continuam sendo verificados pelo backend.

Não houve mudança no contrato público da S2-09; o [OpenAPI](api/openapi.yaml) continua válido. O campo `texto_livre` transporta o contexto dos critérios e a necessidade de interface, sem metadados de autoria ou credenciais. A estrutura obrigatória das propostas e as validações PRO4TECH permanecem no harness.

Esta entrega parte da branch da S2-09 e depende dela. A análise do conteúdo é executada pelo Ollama local configurado no serviço de IA.

## Testes e evidências

| Etapa | Evidência |
| --- | --- |
| Interface | 243 testes passaram, incluindo perguntas, proposta separada, descarte, falha, timeout, resposta atrasada, cancelamento e HTML tratado como texto |
| Backend | 345 testes passaram; 24 condicionais foram ignorados na suíte padrão; tipos e compilação passaram |
| Navegador → API | Modos acionados nos formulários reais, incluindo padronização de épico, feature e PBI |
| API → IA | Harness e FastAPI reais, com respostas simuladas do Ollama |
| API → PostgreSQL | Solicitar análise/padronização não modificou o PBI nem criou sugestões; salvar manualmente após falha da IA persistiu o texto digitado |
| Resposta → tela | Perguntas e proposta renderizadas, demora e cancelamento tratados; nenhuma falha de JavaScript observada |
| Acessibilidade e celular | Nenhuma violação séria/crítica no painel pelo axe; sem rolagem horizontal em largura de 390 px |

Os testes não medem a qualidade semântica do modelo real nem garantem ausência de invenções. A simulação permite verificar o contrato, a preservação da edição e as falhas de forma reproduzível.

Para repetir, a partir da raiz, com as dependências de `backend`, `frontend` e `e2e` instaladas:

```text
docker build -t sinapse-s209-ai-test ai-service
npm run build --prefix frontend
npm run test:integration:copilot --prefix backend
```

O teste usa Edge instalado no Windows ou Chromium no Linux; `E2E_CHROME_PATH` permite informar o executável do navegador. O CI utiliza o Chrome disponível no runner. Banco e serviço de IA são criados em containers temporários e removidos no final, sem alterar os serviços de desenvolvimento.

Evidências com dados sintéticos:

- [Questionador](evidence/S2-10-questionador.png)
- [Padronizador](evidence/S2-10-padronizador.png)
- [Painel no celular](evidence/S2-10-mobile.png)

A revisão por outra pessoa depende da abertura e revisão do PR.

## Revisão adicional de 19/10/2026

Foram acrescentados testes de troca de projeto e modo durante uma solicitação, garantindo que respostas antigas não substituam a análise atual. Os 243 testes da interface passaram, assim como a compilação e o fluxo integrado com PostgreSQL. A suíte compartilhada de IA passou com 87 testes.

Uma amostra com o modelo local real também passou: o questionador pediu um prazo verificável para “rapidamente”, respeitando interface fora do escopo e caminho principal já preenchido; o padronizador retornou a proposta sem pedir novamente os campos informados. As solicitações levaram aproximadamente 11,6 s e 4,1 s. A amostra não garante qualidade semântica para todas as entradas.
