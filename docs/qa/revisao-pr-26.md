# Revisão QA — PR #26 (indicador de completude)

## Falhas corrigidas

- O indicador de `0%` era ocultado por uma condição `> 0`; agora zero é mostrado e apenas `null` significa “sem indicador”.
- O score gravado no PBI ficava desatualizado quando cenários eram criados/removidos. O valor agora é derivado das regras e critérios atuais ao consultar a listagem/detalhe, em vez de confiar no cache da coluna.
- A listagem calcula a pontuação da página em lote, com uma consulta para seus critérios, evitando N+1 consultas por PBI.
- O motor da PR reutiliza as regras determinísticas já existentes na PR #24 para título, história, cenários e termos vagos. Isso elimina a segunda implementação divergente (inclusive um padrão de expressão regular incorreto no motor duplicado).
- O cálculo recebe o conjunto de regras versionado por um provedor e filtra verificações não aplicáveis. **Limite identificado na revisão final:** o provedor de produção atualmente marca todas as verificações habilitadas como aplicáveis; somente os testes com provedor stub exercitam uma regra não aplicável por PBI.
- A resposta do indicador agora informa `rule_version`; o contrato foi incluído no OpenAPI e no tipo consumido pelo frontend.
- A parte de S2-19 necessária ao Cenário 3 foi antecipada: a API lê a política organizacional persistida (singleton enquanto não existir entidade de organização), e um admin pode ativar/desativar as cinco verificações de PBI e ajustar a lista de termos vagos.
- A política inicia com as verificações e termos existentes ativos; cada alteração é transacional, incrementa a versão, registra autor/data e valores anterior/novo em `auditoria`. A API não altera o status de PBIs concluídos.
- O bloqueio de aplicabilidade foi tratado: o PBI agora registra `requer_interface` explicitamente; a verificação versionada `prototipo_vinculado` é omitida do cálculo quando o campo é falso e consulta a tabela `prototipo` quando verdadeiro.
- A configuração está documentada no OpenAPI: `GET /api/v1/quality/configuration/pbi` e `PUT` (admin). A migration aditiva `008_quality_organization_configuration.sql` preserva bancos existentes.
- A migration `009_pbi_interface_quality.sql` adiciona o campo aos PBIs antigos com `false` (sem inferir escopo a partir de texto livre) e acrescenta a verificação de protótipo à política existente sem sobrescrever outras configurações.
- A configuração do Vitest foi atualizada para a API da versão atual; duas vulnerabilidades moderadas nas dependências de teste foram eliminadas.

## Verificações

- Backend: `npm test` — 144 aprovados, 1 teste de carga de seed ignorado conforme configurado; `npm run typecheck` e `npm run build` — aprovados.
- Frontend: `npm test` — 63 aprovados; `npm run build` — aprovado. Backend `npm run audit:security` — 0 vulnerabilidades.
- Cobertura adicional para `0%`, `null`, aplicabilidade real da regra de protótipo com/sem interface, presença/ausência de protótipo, troca de versão/configuração vigente, atualização após mudar cenários, termos vagos customizados e leitura em lote sem N+1.
- O teste de integração PostgreSQL cobre a migration, auditoria/idempotência e o caminho real de consulta à tabela `prototipo`. Docker Desktop não iniciou localmente, mas o check `postgres-compatibility` do CI passou no commit `bf2caba`.

## Resultado e limite de aceite

Esta PR antecipa a parte de S2-19 necessária ao Cenário 3 de PBI-01.3.6: política organizacional persistida para verificações de PBI, endpoint administrativo, versionamento e auditoria. O Cenário 2 agora usa um campo explícito por PBI e valida a existência de protótipo em dados persistidos. Configuração para épicos/features e condições de Definition of Ready/Done (PBI-01.6.2) continuam fora do escopo e permanecem no trabalho restante de S2-19. O check PostgreSQL real passou no CI do commit `bf2caba`; falta a nova revisão independente e aprovação/merge da PR para aceitar a S1-15.

## QA independente

Foi conferido o fluxo contrário ao caso feliz: mudanças nos cenários alteram o score mesmo com cache desatualizado; `0%` continua visível; `null` não vira `100%` nem `0%`; PBI sem interface não inclui protótipo no denominador; com interface e sem protótipo a verificação reprova; com protótipo persistido ela aprova. Testes cobrem validação da API administrativa e termos configuráveis como literais seguros. O CI PostgreSQL passou para a migration 009 e consulta real ao banco; Ollama não participa deste cálculo determinístico.
