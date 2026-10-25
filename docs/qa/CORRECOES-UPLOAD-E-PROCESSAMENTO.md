# Upload e atualização do processamento

Cancelamento e prazo das requisições passam a funcionar juntos. Upload conserva seus 120 segundos, e chat/copiloto mantêm os prazos próprios.

A atualização de documentos conserva as páginas abertas, evita consultas sobrepostas e ignora resultados antigos após envio ou troca de projeto. RepoAnalyzer e painel de ingestão não descartam indefinidamente respostas lentas nem permitem que leituras anteriores desfaçam ações confirmadas.

Testes cobrem upload demorado, prazo máximo, cancelamento, recuperação de falha, paginação aberta e atualização após reprocessar. Os cenários de critérios/decisões entram na branch seguinte, no mesmo arquivo compartilhado de testes de consistência.
