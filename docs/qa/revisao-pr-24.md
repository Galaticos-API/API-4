# Revisão QA — PR #24

## Falha corrigida

As validações de remoção de critérios aconteciam antes da transação. Duas remoções simultâneas podiam validar a mesma contagem antiga e excluir todos os critérios de um épico ou PBI concluído.

## Alteração

- A validação de estado editável e de último critério agora é repetida dentro da transação, depois do lock por entidade.
- A remoção é recusada com erro de validação se, após aguardar o lock, ela removeria o último critério de um item concluído.
- A validação PostgreSQL do CI agora dispara duas exclusões concorrentes e verifica que exatamente uma tem sucesso e que sobra um critério.

## Verificações

- `npm test`: 129 aprovados, 1 teste de carga de seed ignorado conforme configurado.
- `npm run build`: aprovado.
- O cenário concorrente exige PostgreSQL; não foi executado nesta máquina, pois não há banco PostgreSQL descartável disponível. Ele foi incluído no job PostgreSQL do GitHub Actions.

## QA independente e limite

A checagem foi feita pelo caminho concorrente, e não apenas pela sequência comum de apagar critérios. O resultado esperado é preservar o último critério após duas requisições simultâneas. O resultado do CI PostgreSQL deve ser confirmado após o push desta correção.
