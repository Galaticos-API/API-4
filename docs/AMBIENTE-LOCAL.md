# IA no ambiente local

Copie `.env.example` para `.env` e configure os valores locais antes de iniciar.

## IA no Docker

Execute `docker compose --profile local-ai up -d --build`. O backend acessa a IA e o Analyzer por `http://ai-service:8000`, na rede interna. Remova overrides antigos de `AI_SERVICE_URL` ou `REPO_ANALYZER_URL` que apontem para o host se quiser usar esse modo.

## IA nativa no Windows

Com Docker Desktop, Python 3.11 ou superior e Ollama instalados, execute `./start-dev.ps1`. A porta 8000 deve estar livre. O script configura os dois endereços do backend para `http://host.docker.internal:8000` somente durante a execução, sem editar `.env`.

O script verifica os comandos e aguarda respostas HTTP dos serviços antes de anunciar disponibilidade. Essas respostas confirmam a inicialização, mas não substituem a instalação dos modelos Ollama nem um teste de geração real. Os logs da IA ficam em `.sinapse-dev/ai.log` e `.sinapse-dev/ai-error.log`.

Execute `./stop-dev.ps1` para encerrar. O processo nativo é identificado pelo PID, horário de criação e caminho do executável do ambiente virtual deste projeto. Processos de outros projetos são preservados. O Ollama permanece disponível para outros aplicativos.

Valide os controles de processo com `powershell -NoProfile -File scripts/test-dev-process.ps1`. Esse teste usa processos temporários e não encerra os serviços de desenvolvimento.

## Esclarecimentos no copiloto

Na operação `cenarios`, a IA pode retornar uma lista vazia de cenários quando inclui perguntas de esclarecimento. Respostas sem cenários e sem perguntas continuam inválidas. Quando há cenários, as regras de caminho principal e acesso não autorizado continuam sendo verificadas pelo backend.
