# Revisão QA — PR #26 (indicador de completude)

## Falhas corrigidas

- O indicador de `0%` era ocultado por uma condição `> 0`; agora zero é mostrado e apenas `null` significa “sem indicador”.
- O score gravado no PBI ficava desatualizado quando cenários eram criados/removidos. O valor agora é derivado das regras e critérios atuais ao consultar a listagem/detalhe, em vez de confiar no cache da coluna.
- A listagem calcula a pontuação da página em lote, com uma consulta para seus critérios, evitando N+1 consultas por PBI.
- O motor da PR reutiliza as regras determinísticas já existentes na PR #24 para título, história, cenários e termos vagos. Isso elimina a segunda implementação divergente (inclusive um padrão de expressão regular incorreto no motor duplicado).
- O cálculo agora recebe o conjunto de regras versionado por um provedor explícito; verifica aplicabilidade por PBI, remove as não aplicáveis do relatório e do denominador, e lê a configuração uma única vez por página.
- A resposta do indicador agora informa `rule_version`; o contrato foi incluído no OpenAPI e no tipo consumido pelo frontend.
- A configuração do Vitest foi atualizada para a API da versão atual; duas vulnerabilidades moderadas nas dependências de teste foram eliminadas.

## Verificações

- Backend: `npm test` — 139 aprovados, 1 teste de carga de seed ignorado conforme configurado; `npm run typecheck` e `npm run build` — aprovados.
- Frontend: `npm test` — 62 aprovados; `npm run build` — aprovado; `npm audit` — 0 vulnerabilidades.
- Cobertura adicional para `0%`, `null`, aplicabilidade diferente entre PBIs da mesma página, troca de versão/configuração vigente, atualização após mudar cenários e leitura em lote sem N+1.

## Resultado e limite de aceite

Esta PR entrega a fundação e o consumo de um conjunto versionado de regras, além da exclusão por item das verificações não aplicáveis. O provedor de produção desta Sprint usa as quatro regras determinísticas existentes de S1-13. A configuração persistente/editável pelo administrador (PBI-01.6.1 / S2-19), ainda não implementada, deverá substituir esse provedor e fornecer a versão e as regras vigentes; por isso, o Cenário 3 de PBI-01.3.6 ainda não está completo de ponta a ponta e S1-15 não deve ser marcada como concluída até essa integração.

## QA independente

Foi conferido o fluxo contrário ao caso feliz: mudanças nos cenários alteram o score mesmo quando o valor persistido está desatualizado; um PBI que vale `0%` continua visível; `null` não vira `100%` nem `0%`; e uma regra inaplicável a um item não interfere nos demais PBIs da página. PostgreSQL e Ollama locais não foram necessários para esta mudança: não há migration nem chamada de IA neste incremento. O Docker Desktop está indisponível nesta máquina; os checks de integração com PostgreSQL deverão ser revalidados no CI após o envio do novo commit.
