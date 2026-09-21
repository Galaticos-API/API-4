# Revisão QA — PR #26 (indicador de completude)

## Falhas corrigidas

- O indicador de `0%` era ocultado por uma condição `> 0`; agora zero é mostrado e apenas `null` significa “sem indicador”.
- O score gravado no PBI ficava desatualizado quando cenários eram criados/removidos. O valor agora é derivado das regras e critérios atuais ao consultar a listagem/detalhe, em vez de confiar no cache da coluna.
- A listagem calcula a pontuação da página em lote, com uma consulta para seus critérios, evitando N+1 consultas por PBI.
- O motor da PR reutiliza as regras determinísticas já existentes na PR #24 para título, história, cenários e termos vagos. Isso elimina a segunda implementação divergente (inclusive um padrão de expressão regular incorreto no motor duplicado).
- O cálculo recebe o conjunto de regras versionado por um provedor e filtra verificações não aplicáveis. **Limite identificado na revisão final:** o provedor de produção atualmente marca todas as verificações habilitadas como aplicáveis; somente os testes com provedor stub exercitam uma regra não aplicável por PBI.
- A resposta do indicador agora informa `rule_version`; o contrato foi incluído no OpenAPI e no tipo consumido pelo frontend.
- A parte de S2-19 necessária ao Cenário 3 foi antecipada: a API lê a política organizacional persistida (singleton enquanto não existir entidade de organização), e um admin pode ativar/desativar as quatro verificações de PBI e ajustar a lista de termos vagos.
- A política inicia com as quatro verificações e termos existentes ativos; cada alteração é transacional, incrementa a versão, registra autor/data e valores anterior/novo em `auditoria`. A API não altera o status de PBIs concluídos.
- A configuração está documentada no OpenAPI: `GET /api/v1/quality/configuration/pbi` e `PUT` (admin). A migration aditiva `008_quality_organization_configuration.sql` preserva bancos existentes.
- A configuração do Vitest foi atualizada para a API da versão atual; duas vulnerabilidades moderadas nas dependências de teste foram eliminadas.

## Verificações

- Backend: `npm test` — 143 aprovados, 1 teste de carga de seed ignorado conforme configurado; `npm run typecheck` e `npm run build` — aprovados.
- Frontend: `npm test` — 62 aprovados; `npm run build` — aprovado; `npm audit` — 0 vulnerabilidades.
- Cobertura adicional para `0%`, `null`, o contrato do serviço para aplicabilidade diferente entre PBIs (com provedor stub), troca de versão/configuração vigente, atualização após mudar cenários, termos vagos customizados e leitura em lote sem N+1.

## Resultado e limite de aceite

Esta PR antecipa a parte de S2-19 necessária ao Cenário 3 de PBI-01.3.6: política organizacional persistida para verificações de PBI, endpoint administrativo, versionamento e auditoria. A validação final identificou que a aplicabilidade individual ainda não está conectada aos dados reais dos PBIs: a configuração de produção devolve `true` para toda verificação habilitada, e o conjunto atual não inclui a exigência de protótipo. Portanto, o Cenário 2 não pode ser considerado demonstrado no sistema real; falta definir/implementar como identificar itens sem interface antes de incluir essa regra. Configuração para épicos/features e condições de Definition of Ready/Done (PBI-01.6.2) continuam fora do escopo e permanecem no trabalho restante de S2-19. Não mesclar nem concluir S1-15 até resolver essa lacuna e obter nova revisão independente.

## QA independente

Foi conferido o fluxo contrário ao caso feliz: mudanças nos cenários alteram o score mesmo com cache desatualizado; `0%` continua visível; e `null` não vira `100%` nem `0%`. A exclusão por aplicabilidade é testada com um provedor stub, mas não está habilitada por item no provedor de produção — por isso permanece um impedimento de aceite. Testes cobrem validação da API administrativa e termos configuráveis como literais seguros. Como o Docker está indisponível, a migration e a transação foram validadas pelo CI do commit `f48befc`: `postgres-compatibility` e `Validate curated seed on PostgreSQL` passaram, incluindo configuração inicial, versão, autoria, auditoria e rollback. Ollama não participa deste cálculo determinístico.
