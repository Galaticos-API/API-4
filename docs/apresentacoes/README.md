# Apresentação da Sprint 2 — PRO4TECH

Esta pasta reúne os materiais usados na apresentação do Sinapse para a equipe da PRO4TECH:

- `apresentacao-pro4tech-sprint2-fullhd-silencioso-final.mp4`: vídeo final em Full HD (1920×1080), 30 fps, sem áudio. A narração é feita ao vivo.
- `roteiro-video-mudo-fala-ao-vivo.md`: sequência das telas e falas sugeridas.
- `pro4tech-cenarios-demonstracao.md`: documento-fonte usado para demonstrar as três respostas do chat.

## Reproduzir a demonstração

1. Clone a `main` e siga [`docs/SETUP_GUIDE.md`](../SETUP_GUIDE.md) para iniciar o sistema. Para respostas geradas pelo chat, configure também o Ollama local com os modelos `bge-m3` e `qwen2.5:1.5b`.
2. Entre no sistema e crie um projeto chamado `Demonstração Pro4Tech — API 1` (ou use um projeto de demonstração existente).
3. Na área de Conhecimento/documentos desse projeto, envie `pro4tech-cenarios-demonstracao.md` e aguarde o processamento/indexação terminar.
4. Abra uma nova conversa, selecione esse projeto como escopo e use as consultas abaixo. Os textos foram verificados contra o documento-fonte e retornam uma resposta com a fonte citada:
   - `Qual é o prazo para a primeira análise de uma solicitação urgente?`
   - `Quando uma solicitação precisa de aprovação adicional de Finanças?`
   - `Quais informações são registradas quando o status de uma solicitação muda?`

Uma saudação como `Oi` também é atendida sem consulta ao acervo. Se o documento ainda estiver processando, aguarde antes de perguntar. A disponibilidade da resposta gerada depende dos serviços locais de IA e do Ollama; o arquivo de vídeo permanece reproduzível sem esses serviços.

## Limites dos dados apresentados

Os prazos, valores e regras do documento são exemplos inventados para demonstrar recuperação de informação e citações. Não os apresente como políticas ou decisões reais da PRO4TECH. O vídeo mostra capturas do fluxo concluído; não implica disponibilidade contínua dos serviços externos ou do ambiente local de IA.
