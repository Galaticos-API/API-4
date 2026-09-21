# Revisão QA — PR #26 (indicador de completude)

## Falhas corrigidas

- O indicador de `0%` era ocultado por uma condição `> 0`; agora zero é mostrado e apenas `null` significa “sem indicador”.
- O score gravado no PBI ficava desatualizado quando cenários eram criados/removidos. O valor agora é derivado das regras e critérios atuais ao consultar a listagem/detalhe, em vez de confiar no cache da coluna.
- A listagem calcula a pontuação da página em lote, com uma consulta para seus critérios, evitando N+1 consultas por PBI.
- O motor da PR reutiliza as regras determinísticas já existentes na PR #24 para título, história, cenários e termos vagos. Isso elimina a segunda implementação divergente (inclusive um padrão de expressão regular incorreto no motor duplicado).
- O cálculo agora recebe o conjunto de regras versionado por um provedor explícito; verifica aplicabilidade por PBI, remove as não aplicáveis do relatório e do denominador, e lê a configuração uma única vez por página.
- A resposta do indicador agora informa `rule_version`; o contrato foi incluído no OpenAPI e no tipo consumido pelo frontend.
- A parte de S2-19 necessária ao Cenário 3 foi antecipada: a API lê a política organizacional persistida (singleton enquanto não existir entidade de organização), e um admin pode ativar/desativar as quatro verificações de PBI e ajustar a lista de termos vagos.
- A política inicia com as quatro verificações e termos existentes ativos; cada alteração é transacional, incrementa a versão, registra autor/data e valores anterior/novo em `auditoria`. A API não altera o status de PBIs concluídos.
- A configuração está documentada no OpenAPI: `GET /api/v1/quality/configuration/pbi` e `PUT` (admin). A migration aditiva `008_quality_organization_configuration.sql` preserva bancos existentes.
- A configuração do Vitest foi atualizada para a API da versão atual; duas vulnerabilidades moderadas nas dependências de teste foram eliminadas.

## Verificações

- Backend: `npm test` — 143 aprovados, 1 teste de carga de seed ignorado conforme configurado; `npm run typecheck` e `npm run build` — aprovados.
- Frontend: `npm test` — 62 aprovados; `npm run build` — aprovado; `npm audit` — 0 vulnerabilidades.
- Cobertura adicional para `0%`, `null`, aplicabilidade diferente entre PBIs da mesma página, troca de versão/configuração vigente, atualização após mudar cenários, termos vagos customizados e leitura em lote sem N+1.

## Resultado e limite de aceite

Esta PR entrega o indicador de S1-15 e antecipa somente a parte de S2-19 necessária ao Cenário 3 de PBI-01.3.6: política organizacional persistida para verificações de PBI, endpoint administrativo, versionamento e auditoria. Configuração para épicos/features e condições de Definition of Ready/Done (PBI-01.6.2) continuam fora do escopo e devem permanecer como trabalho restante de S2-19. S1-15 só pode ser marcada como concluída após os testes com PostgreSQL real e a revisão/merge da PR.

## QA independente

Foi conferido o fluxo contrário ao caso feliz: mudanças nos cenários alteram o score mesmo quando o valor persistido está desatualizado; `0%` continua visível; `null` não vira `100%` nem `0%`; e regra inaplicável não interfere nos demais PBIs. Testes novos cobrem validação HTTP da configuração e termos configuráveis como literais seguros. PostgreSQL e Ollama locais não são dependências para os testes unitários determinísticos. Como o Docker está indisponível nesta máquina, a migration e a transação foram validadas pelo CI do commit `f48befc`: os checks `postgres-compatibility` e `Validate curated seed on PostgreSQL` passaram em PostgreSQL real, incluindo configuração inicial, versão, autoria, auditoria e rollback. O Ollama não participa deste fluxo determinístico.
