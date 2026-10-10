# Organização do frontend

- `src/api`: clientes HTTP e contratos de transporte.
- `src/models`: modelos, navegação e funções puras do domínio.
- `src/viewmodels`: hooks de estado compartilhado e autenticação.
- `src/views`: telas e componentes organizados por funcionalidade.
- `src/views/common`: componentes compartilhados; primitivas visuais em `ui`.
- `src/styles`: tokens, componentes e layout globais.
- `src/assets/styles`: estilos específicos de funcionalidades, incluindo documentos.

Os imports apontam diretamente para a implementação. Os antigos módulos de reexportação em `auth`, `backlog`, `components` e `projects` foram removidos; seus testes agora ficam junto às funcionalidades.

Projetos têm componentes separados para listagem, formulário e detalhe. PBIs seguem a mesma divisão. A árvore do backlog separa filtros, renderização dos nós e carregamento/interações da tela. As funções de filtro não dependem de React.

O dashboard distingue serviços verificados de serviços sem diagnóstico. O estado do banco vem do healthcheck do backend; falhas de acesso pelo navegador não são tratadas como prova de indisponibilidade dos serviços não verificados.

`src/views/admin/IngestionObservabilityView.tsx` (rota `/admin/ingestion`, só admin) acompanha em tempo real o pipeline de ingestão de documentos — substitui o editor do n8n como ferramenta visual. Ver [../IMPLEMENTACAO_PIPELINE_INGESTAO.md](../IMPLEMENTACAO_PIPELINE_INGESTAO.md).

Execute `npm test` e `npm run build` nesta pasta.
