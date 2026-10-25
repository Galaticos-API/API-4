# Consistência de critérios e decisões

As operações de criar, mover e remover critérios são serializadas. Os controles ficam bloqueados até terminar a operação, impedindo que uma resposta antiga reapresente um critério removido.

Salvar uma decisão cancela a consulta anterior e recarrega a lista. Registrar durante o carregamento deixa de exibir sucesso junto de uma lista vazia desatualizada.

Os cenários entram na suíte de consistência da interface. Esta última branch também conecta ao CI as regressões HTTP das cinco branches e consolida o OpenAPI. A integração cobre autorização, evidências, entradas inválidas, paginação com microssegundos e os caminhos válidos de busca, arquivamento e expurgo.

Validação consolidada antes da separação: 157 testes frontend, 86 backend, 13 no navegador; builds, integrações de indexação, regressões HTTP e 30 verificações de qualidade aprovados. As branches são novamente verificadas antes dos merges.
