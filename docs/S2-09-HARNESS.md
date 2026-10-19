# S2-09 — Harness versionado da PRO4TECH

## Entrega

O backend mantém configurações independentes para levantamento, consulta e recomendação. Cada modo possui instruções gerais, instruções por operação, limite de espera e regras de qualidade. O serviço de IA local recebe uma revisão explícita em cada chamada, produz JSON e valida o resultado contra o schema correspondente. O backend confere novamente a resposta e as regras do guia.

| Modo | Operações | Saída |
| --- | --- | --- |
| levantamento | questionar | perguntas por dimensão e resumo; perguntas vazias quando não houver lacunas relevantes |
| levantamento | padronizar | proposta nos campos do nível e perguntas; proposta nula quando faltam informações |
| levantamento | cenarios | cenários DADO/QUANDO/ENTÃO e perguntas; somente PBI |
| consulta | responder | resposta e IDs das fontes; recusa explícita quando não há evidência |
| recomendacao | similares | IDs e justificativas dos candidatos pertinentes; lista vazia quando não há candidatos |

Os campos de épico, feature e PBI têm schemas separados, fechados para propriedades desconhecidas. Propostas respeitam os limites dos campos do ciclo de sugestões existente. Títulos de PBI passam pela validação determinística de infinitivo já usada no produto; os três blocos da história são obrigatórios em uma proposta completa. O guia consultado foi `docs/Kick-off/Guia_Especificacao_Itens_de_Trabalho_FATEC.pdf`.

As seis dimensões são caminho principal, validações, erros/indisponibilidade, permissões/segurança, estados alternativos e interface/compatibilidade. As instruções proíbem inventar informação e tratam o item e os trechos como dados, não como comandos. Termos de detalhamento de tela em épicos/features e termos de implementação em propostas são verificados também pelo backend. Essas listas são configuráveis por modo.

Os schemas e as regras obrigatórias de estrutura fazem parte do contrato `schema_version: 1`, versionado no código. O administrador altera instruções, timeout e listas de termos sem reinício; não pode remover os blocos obrigatórios da história nem abrir o schema para campos arbitrários. Evoluções incompatíveis do contrato exigem uma nova versão de schema e uma implantação do código.

## Revisões e atualização imediata

A migration `019_ai_harness.sql` cria `ai_harness_revision`. A maior revisão de cada modo é a vigente. Enquanto não houver revisão salva, é utilizada a versão zero, distribuída e versionada no código.

- Salvar sempre acrescenta uma revisão com autor e data. O histórico não é sobrescrito pela API.
- `expected_version` evita sobrescrever uma alteração concorrente. Um lock transacional por modo também protege a primeira revisão; conflito retorna 409.
- A próxima solicitação consulta o banco novamente, inclusive quando atendida por outra instância. Não há cache de configuração em processo.
- Uma solicitação já iniciada mantém a revisão que leu. A resposta identifica modo, revisão e versão do schema.
- Para reverter uma alteração, publique a configuração anterior com a revisão esperada atual. A reversão é uma nova revisão e mantém o histórico.

## API

Rotas administrativas exigem sessão e perfil admin:

- `GET /api/v1/admin/ai-harness/{mode}`: configuração vigente e schemas por operação/nível.
- `PUT /api/v1/admin/ai-harness/{mode}`: recebe `{ expected_version, config }` e publica a revisão.
- `GET /api/v1/admin/ai-harness/{mode}/history`: até 50 revisões em ordem decrescente; `before` e `next_before` permitem continuar.

Execução exige admin ou PO e acesso ao projeto:

`POST /api/v1/projects/{projectId}/ai/requests`

```json
{
  "mode": "levantamento",
  "operation": "questionar",
  "level": "pbi",
  "fields": { "titulo": "Consultar pedido", "texto_livre": "O cliente acompanha a entrega." }
}
```

Para consulta ou recomendação, use `fields.pergunta`. O cliente não envia trechos: o backend os recupera dentro do projeto autorizado. Fontes não recuperadas são rejeitadas. A consulta do chat existente passou a usar o modo consulta deste harness; o endpoint legado interno `/rag/query` foi preservado por compatibilidade.

A execução não grava nem altera itens ou sugestões. Nenhuma aceitação automática é implementada. Timeout, JSON inválido, schema incompatível ou proposta rejeitada pelo guia retornam 503 com mensagem segura. Prompts, respostas e credenciais não são adicionados a logs. Respostas administrativas e de execução usam `Cache-Control: no-store`.

Os contratos estão em [OpenAPI do backend](api/openapi.yaml) e [OpenAPI interno da IA](api/harness-internal.yaml). O serviço Python exige `X-Service-Token` e usa exclusivamente o Ollama configurado no ambiente local. Não oferece seleção de provedor remoto na API.

## Preparação e testes

Na primeira implantação, aplique as migrations do backend e reconstrua o serviço de IA para instalar `jsonschema`. Essas etapas de implantação não são necessárias a cada alteração administrativa.

```text
cd backend
npm run migrate
```

Para repetir o teste integrado a partir da raiz:

```text
docker build -t sinapse-s209-ai-test ai-service
cd backend
npm run test:integration:harness
```

O teste cria PostgreSQL e FastAPI temporários, aplica as migrations e simula somente as respostas do Ollama. Valida sessão, perfil, atualização imediata, duas instâncias lendo a revisão, concorrência, histórico, reversão, rejeição de JSON inválido, isolamento entre projetos e integração com o chat. Remove os containers e volumes temporários ao terminar e preserva os serviços de desenvolvimento. O mesmo fluxo foi incluído no CI.

Validação local: 345 testes do backend passaram, com 24 condicionais ignorados na suíte padrão; 81 testes Python passaram. Compilação e verificação de tipos do backend passaram, além do teste integrado em PostgreSQL/FastAPI. Os schemas usados nos testes Python são comparados automaticamente com os publicados pelo backend.

Os testes comprovam os contratos e as regras determinísticas. A qualidade semântica das respostas do modelo real não foi medida nesta entrega; instruções e validação estrutural não constituem prova de ausência de invenções do modelo.

A interface dos modos questionador e padronizador continua no escopo da S2-10. A revisão de PR por outra pessoa é uma etapa externa à implementação local.
