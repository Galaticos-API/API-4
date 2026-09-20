# Revisão QA — PR #26 (indicador de completude)

## Falhas corrigidas

- O indicador de `0%` era ocultado por uma condição `> 0`; agora zero é mostrado e apenas `null` significa “sem indicador”.
- O score gravado no PBI ficava desatualizado quando cenários eram criados/removidos. O valor agora é derivado das regras e critérios atuais ao consultar a listagem/detalhe, em vez de confiar no cache da coluna.
- A listagem calcula a pontuação da página em lote, com uma consulta para seus critérios, evitando N+1 consultas por PBI.
- O motor da PR reutiliza as regras determinísticas já existentes na PR #24 para título, história, cenários e termos vagos. Isso elimina a segunda implementação divergente (inclusive um padrão de expressão regular incorreto no motor duplicado).
- A configuração do Vitest foi atualizada para a API da versão atual; duas vulnerabilidades moderadas nas dependências de teste foram eliminadas.

## Verificações

- Backend: `npm test` — 134 aprovados, 1 teste de carga de seed ignorado conforme configurado; `npm run build` — aprovado.
- Frontend: `npm test` — 62 aprovados; `npm run build` — aprovado; `npm audit` — 0 vulnerabilidades.
- Cobertura adicional para `0%`, `null`, verificações não aplicáveis e recálculo após alterar cenários.

## Resultado e limite de aceite

Esta entrega calcula o indicador com o conjunto de regras determinísticas atual. A configuração administrativa por organização, descrita no cenário de configuração do backlog e planejada em FT-01.6 (Sprint 2), ainda não existe; portanto, a PR não deve ser considerada como conclusão desse cenário nem como fechamento integral da configuração organizacional. O cálculo sabe excluir verificações não aplicáveis, mas o catálogo atual ainda marca suas quatro verificações como aplicáveis até existir a configuração de regras.

## QA independente

Foi conferido o fluxo contrário ao caso feliz: mudanças nos cenários alteram o score mesmo quando o valor persistido está desatualizado; um PBI que vale `0%` continua visível; e `null` não vira `100%` nem `0%`. A integração real com PostgreSQL está coberta no CI e deve ser verificada após o push.
