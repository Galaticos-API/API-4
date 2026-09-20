# Revisão QA — PR #25 (RepoAnalyzer)

## Falhas corrigidas

- Removido o login simulado que autenticava qualquer senha e escrevia a senha no console; a tela voltou a usar o endpoint real de login. Cadastro falso foi removido porque a API não oferece essa rota.
- Alinhado o corpo enviado pela interface (`repositorio_url`), a entrada que a rota recebe e o campo `url` exigido pelo serviço Python.
- Adaptados os estados e campos reais do RepoAnalyzer (`queued/running/completed/failed`, `stage`, `stage_label`, `stage_index`, `stage_count`, `message`, `error` e `stats`) para o contrato persistido pela API.
- Consultas de uma análise agora exigem também o ID do projeto na consulta ao banco, impedindo retornar uma análise de outro projeto por um ID conhecido.
- Corrigido o tratamento de erros da interface para exibir a mensagem lançada pelo cliente HTTP e adicionados timeouts às chamadas do serviço.

## Verificações

- Backend: `npm test` — 103 aprovados, 1 teste de carga de seed ignorado conforme configurado; `npm run build` — aprovado.
- Frontend: `npm test` — 56 aprovados; `npm run build` — aprovado.
- RepoAnalyzer: 8 testes Python aprovados em ambiente virtual temporário.
- Sem execução integrada com Ollama/PostgreSQL nesta máquina; a validação de ponta a ponta ainda depende desses serviços.

## QA independente e pontos fora do escopo

Além dos fluxos felizes, foram conferidos login inválido, payloads entre as três camadas, estados durante/fim/falha e acesso cruzado entre projetos. As rotas do serviço de IA continuam destinadas à rede interna; autenticação serviço-a-serviço e execução real com Ollama devem ser confirmadas/configuradas no ambiente de implantação antes de expor o serviço publicamente.
