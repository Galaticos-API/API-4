# Acervo de demonstração sintético de QA — Portal de Pagamentos PIX

> Todo o conteúdo operacional deste documento é fictício e serve apenas para exercícios locais de busca e chat. “Banco Horizonte”, limites, horários, tecnologias auxiliares e código canário não representam um banco real, contrato, decisão aprovada nem produção. Não há chaves PIX ou dados pessoais reais neste arquivo.

## Contexto do cenário

Este cenário de teste descreve um portal hipotético de pagamentos instantâneos. A pessoa pagadora informa valor, escolhe uma chave PIX e confirma os dados do recebedor antes de autorizar. A experiência deve mostrar estados claros de validação, processamento, liquidação, falha e estorno, sem exibir dados sensíveis completos em telas compartilhadas.

## Decisões técnicas fictícias de QA

Para esta fixture, o ledger transacional usa PostgreSQL e mantém o registro financeiro definitivo. Redis mantém chaves de idempotência temporárias por 24 horas para evitar duplicidade durante repetição de requisições. RabbitMQ distribui eventos de processamento e conciliação; a fila não substitui o ledger. Esses nomes são exemplos inventados para permitir perguntas sobre banco, cache, mensageria e responsabilidade de cada componente.

## Validação de chave e confirmação

O cenário usa um serviço fictício chamado Banco Horizonte para consulta de chaves no DICT. O limite de teste para a primeira validação é 800 milissegundos, em linha com o PBI demonstrativo existente no projeto. Antes de autorizar, a tela mostra o nome do recebedor e mascara os demais dados, exibindo somente os primeiros dígitos previstos no cenário. Uma chave inexistente interrompe o fluxo e não cria uma transação liquidável.

## Envio, idempotência e estados

O endpoint fictício de envio aceita um cabeçalho `Idempotency-Key`. Repetir a mesma chave com o mesmo conteúdo deve devolver o mesmo resultado da operação original, sem novo débito. Reutilizar a chave com valor ou destinatário diferentes deve retornar conflito e gerar registro de auditoria, sem executar uma segunda transação. O tempo alvo demonstrativo de liquidação é inferior a dois segundos.

## Conciliação e estorno

No cenário de QA, a conciliação compara os eventos confirmados pelo provedor fictício com os lançamentos do ledger. Uma divergência fica em estado “revisão pendente” e exige análise humana; o sistema não deve corrigir saldo silenciosamente. Um estorno referencia a transação original, registra motivo e autor e nunca remove o evento original do histórico.

## Regras de segurança

Chaves, identificadores de conta e documentos devem ser mascarados nos logs e na interface. A trilha de auditoria registra horário, identificador da transação, resultado, motivo de falha e correlation ID, mas não armazena segredo de autenticação nem chave PIX completa. A API verifica autenticação e autorização antes de consultar o DICT ou iniciar débito.

## Requisitos e critérios de aceitação

Como correntista, quero validar a chave e conferir o recebedor antes de confirmar, para reduzir o risco de enviar dinheiro à pessoa errada. Dado que a chave está cadastrada, quando a pessoa solicitar a validação, então o portal deve mostrar o recebedor mascarado e habilitar a confirmação. Dado que a chave não existe, quando a validação terminar, então o portal deve explicar a falha e impedir o envio.

Como pessoa operadora, quero consultar uma transação pelo identificador e ver seus eventos de conciliação, para investigar divergências sem apagar o histórico. Dado que existe divergência entre provedor e ledger, quando o relatório for processado, então a operação deve ficar em revisão pendente e apontar o evento de origem.

## Perguntas úteis para QA

- Qual banco guarda o ledger e para que o Redis é usado neste cenário?
- Que sistema fictício consulta a chave PIX?
- Qual é o tempo alvo de validação da chave?
- O que acontece se a mesma `Idempotency-Key` for reenviada?
- O que deve ocorrer quando a chave PIX não existe?
- Como a conciliação trata uma divergência?
- O estorno apaga a transação original?
- Quais dados devem ser mascarados nos logs?
- Qual é o tempo alvo demonstrativo de liquidação?

## Canário sintético exclusivo

Fato inventado para teste de isolamento: **no Portal de Pagamentos PIX, o código canário é `PIX-QA-731` e o nome do ambiente fictício é “Lagoa Verde”.** Esse fato não deve aparecer nas respostas de outros projetos.

## Lacunas intencionais

O cenário não define instituição financeira real, credenciais, chaves PIX válidas, tarifas comerciais, limite monetário aprovado nem SLA contratual. O assistente deve dizer que não encontrou esses dados, em vez de inventá-los.
