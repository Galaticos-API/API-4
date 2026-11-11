# S3-07 — Streaming validado e cancelável

## Objetivo
Entregar trechos de resposta progressivamente no chat sem expor tokens nem evidências não verificadas, preservar o parcial seguro ao cancelar/interromper e anexar resposta canônica e fontes somente no evento `completed`.

## Etapas e checkpoints
1. **Contrato e cobertura (QA)** — testar o contrato externo SSE, ordenação/sequência, ausência de fontes antes da conclusão, cancelamento, erro e callbacks obsoletos. Checkpoint: testes falham antes da implementação pelos motivos esperados.
2. **AI service** — adicionar stream interno de candidatos estruturados da saída do harness. Nunca emitir tokens crus; somente candidatos completos e identificáveis. Checkpoint: JSON truncado/malformado, abort e resultado final parity cobertos.
3. **Backend** — validar cada candidato contra citação exata recuperada, pergunta/decisão, escopo autorizado e estado atual dos chunks antes de enviar `evidence_chunk` ao browser; somente `completed` inclui fontes. Checkpoint: candidatos inválidos/não autorizados não vazam.
4. **Frontend** — criar um único balão incremental, substituir pelo resultado canônico ao concluir, preservar parcial validado com estado incompleto em abort/falha e ignorar eventos atrasados após troca de conversa; manter fila pausada. Checkpoint: testes de reducer/API/UI e fluxo FIFO.
5. **Revisão independente e validação** — revisar segurança, contrato OpenAPI, compatibilidade, testes backend/frontend/AI e typecheck/build. Resolver achados antes de considerar S3-07 pronta.

## Regras de aceitação
- Nenhum token bruto, fonte ou ID de fonte aparece antes de `completed`.
- Cada trecho emitido no browser já passou validações de evidência e autorização no backend.
- `completed` continua sendo a resposta persistida canônica com fontes.
- Cancelamento/falha não persiste resposta parcial como concluída; UI identifica claramente o parcial como incompleto.
- Eventos SSE seguem sequência; falhas após abertura do stream usam evento de erro seguro.
- Escopo imutável e isolamento por projeto continuam aplicados.

## Fora do escopo
Persistir parciais como mensagens completas, mudar política de RAG ou relaxar regras de citação/isolamento; commit e push.
