# Automação do Trello — Sinapse

O script `scripts/trello-sync.mjs` sincroniza o plano técnico com o quadro
`Sinapse — Scrum — 2026/2` (`CY2QHrh1`). Ele:

- preserva as listas já criadas e adiciona apenas as ausentes;
- cria etiquetas autoexplicativas de sprint, prioridade e área técnica;
- cria 67 cartões, distribuídos em 32 / 18 / 17;
- cria sete cartões de governança para regras, impedimentos, equipe, calendário e metas das
  três sprints;
- cria etiquetas de papel para Dev Team, Product Owner e Scrum Master, sem usar nomes de
  pessoas como etiquetas;
- registra início e término em todos os cartões e ordena o backlog de cada sprint por
  `Bloqueante/Must`, `Should` e `Could`;
- mantém a política de WIP em 7 cartões em andamento, 4 em revisão e 4 em teste;
- não atribui integrantes;
- reconhece cartões pelo ID e pode ser executado novamente sem duplicá-los;
- não move cartões existentes de volta ao backlog, salvo com `--reset-status`.

Cada tarefa recebe exatamente uma etiqueta de sprint, uma de prioridade e ao menos uma de
área. A descrição começa por um resumo simples, apresenta o detalhamento em seguida e inclui
links diretos para todas as User Stories/PBIs relacionadas.

## Credenciais

Crie uma API key e um User Token conforme a documentação oficial do Trello. O token concede
acesso à conta e não deve ser enviado por mensagem, inserido no código ou salvo no Git.

No PowerShell, defina as credenciais apenas para a sessão atual:

```powershell
$env:TRELLO_API_KEY = "sua-chave"
$env:TRELLO_TOKEN = "seu-token"
```

## Execução

Validar chamadas sem fazer alterações:

```powershell
node scripts/trello-sync.mjs --dry-run
```

Sincronizar o quadro:

```powershell
node scripts/trello-sync.mjs
```

Somente se desejar devolver todos os cartões às listas originais das sprints:

```powershell
node scripts/trello-sync.mjs --reset-status
```
