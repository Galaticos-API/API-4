# Sistema visual do Sinapse

O ponto de entrada global é src/index.css. Ele importa, nesta ordem:

1. tokens.css: fonte única de cores, tipografia, espaçamento, raios e estados.
2. components.css: primitivas ds-* e suas variantes.
3. layout.css: cabeçalho, navegação, estrutura das páginas e regras responsivas.

Estilos específicos de funcionalidades ficam em src/assets/styles e usam os mesmos tokens. Não devem redefinir botões, badges ou uma paleta paralela.

Para ações, use Button de views/common/ui com variant primary, secondary, ghost ou danger. Ele compartilha os mesmos estilos em autenticação, projetos, backlog, conhecimento e administração. Use Badge, Field, Alert e os demais componentes compartilhados quando aplicáveis. ds-card--glass é uma variante do mesmo card, sem espaçamento interno, para contêineres que já controlam seu próprio layout.

As classes garakis, btn-primary, btn-secondary, badge-* e glass-panel foram migradas para ds-*. O stylesheet do protótipo foi removido; a paleta foi preservada nos tokens canônicos. Os imports e testes foram migrados para os caminhos canônicos, permitindo remover os reexports dos diretórios antigos.

Validação: 195 testes passaram; build aprovado. Inspeção com Chromium/Edge headless em 1440 e 390 px, usando respostas de API simuladas, cobriu projetos, novo projeto, backlog, conhecimento e administração. Nessas páginas não houve erros JavaScript nem overflow horizontal do documento, e os botões usam os mesmos raios e pesos tipográficos. Essa inspeção não substitui integração com backend e banco reais.
