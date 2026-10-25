# Validação das entradas da API

Datas de projetos passam a validar calendário, horário e fuso. Cadastro e login respeitam os limites de nome e e-mail do banco. Os campos de projetos, backlog, decisões, sugestões e configurações recusam Unicode inválido e caractere nulo antes de gravar.

Justificativas de arquivamento/expurgo e termos das buscas recebem a mesma proteção. Cursores de documentos recusam datas inválidas sem perder microssegundos.

Os testes de texto, cadastro, sugestões e cursores acompanham a alteração. A integração HTTP consolidada é acrescentada na última branch da sequência, depois das correções de acesso e paginação que ela também verifica.
