# Paginação do backlog e do histórico

As listas de épicos, features e PBIs oferecem continuação depois dos primeiros cem itens. O filtro Todos inclui os arquivados, e o cursor por data/ID evita duplicações durante inserções ou exclusões entre páginas.

O histórico de auditoria preserva microssegundos na geração e leitura do cursor, com desempate por ID. Registros dentro do mesmo milissegundo deixam de ser omitidos.

Os testes de listas e cursores acompanham a alteração. A branch depende da validação compartilhada de texto e datas, incorporada antes na sequência.
