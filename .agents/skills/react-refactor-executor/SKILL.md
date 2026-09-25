---
name: react-refactor-executor
description: >-
  Executa a refatoração adaptável de um projeto React desorganizado para a arquitetura MVVM (Model-View-ViewModel), preservando 100% das funcionalidades originais, adaptando-se à stack do projeto alvo, reorganizando a estrutura de pastas e executando testes automatizados para garantir regressão zero.
---

# React Refactor Executor Skill

Esta skill instrui um agente executor a realizar a refatoração estrutural de uma aplicação React desorganizada, convertendo-a para o padrão **MVVM (Model-View-ViewModel)** com base no template de referência, com **flexibilidade adaptativa** para preservar 100% da integridade funcional, da stack existente e da experiência do usuário.

---

## 📋 Pré-requisitos & Diretrizes de Flexibilidade

1. **Garantia de 100% de Preservação Funcional**:
   - Nenhuma funcionalidade, fluxo de tela, parâmetro de requisição ou regra de negócio existente no projeto alvo pode ser removido, simplificado ou alterado durante a reorganização estrutural.
2. **Adaptação Flexível à Stack do Projeto Alvo**:
   - Respeite a biblioteca de estilização (Bootstrap, Tailwind CSS, Styled Components, CSS Modules, etc.) e o sistema de roteamento (React Router, roteamento interno por estado, etc.) já utilizados no projeto alvo.
   - Ajuste a estrutura MVVM para acomodar as particularidades de cada biblioteca sem impor substituição involuntária de dependências.
3. **Padrão de Nomenclatura Adaptável**:
   - **Views**: Componentes React em PascalCase no diretório `src/views/` ou `src/features/<modulo>/views/`.
   - **ViewModels**: Gerenciadores de estado e chamadas de API em `src/viewmodels/` (ex: `AppViewModel.jsx` ou `<Modulo>ViewModel.js`).
   - **Models**: Regras puras, Schemas, Enums e Validadores em `src/models/`.

---

## 🚀 Roteiro de Execução da Refatoração

Siga as fases em ordem sequencial:

### **Fase 1: Mapeamento de Funcionalidades & Auditoria Inicial**
1. **Mapear 100% dos Fluxos Existentes**:
   - Liste todas as telas, rotas, modais, formulários, chamadas HTTP e estados do projeto alvo.
2. **Executar a Suíte de Testes Atual (se existente)**:
   - Execute a suíte de testes pré-existente (ex: `npm test`, `npm run test`) para registrar o estado de funcionamento inicial.

---

### **Fase 2: Preparação dos Diretórios MVVM**
Crie ou reorganize a estrutura de pastas oficial do template dentro de `src/`:

- `src/models/`: Regras de negócio puras, Enums, Schemas e Validações.
- `src/viewmodels/`: Gerenciamento de estado e integração com serviços backend/API.
- `src/views/`: Componentes visuais de UI (telas, formulários, modais, elementos de layout).
- `src/assets/`: Recursos estáticos (imagens, ícones, estilos específicos).

---

### **Fase 3: Extração da Camada Model (`src/models/`)**

1. **Isolar Enums, Constantes e Schemas**:
   - Mova definições de constantes, enums de status e perfis de acesso para a pasta `src/models/`.
2. **Extrair Funções Fabris e Validadores Puros**:
   - Mova utilitários de validação de formulários e construtores de entidade para `models/`.
3. **Isolar Regras de Autorização / Permissão**:
   - Mova funções de validação de regras de acesso (ex: `podeAcessar`, `podeEscrever`).
4. **Regra de Isolamento**: O diretório `src/models/` deve conter apenas código JavaScript/TypeScript puro, sem dependências de React UI ou bibliotecas de requisição HTTP.

---

### **Fase 4: Centralização do ViewModel (`src/viewmodels/`)**

1. **Construir a Camada de Estado (Context API / Reducer / Store)**:
   - Crie o `AppViewModel.jsx` (ou ViewModels por domínio/feature) para centralizar o estado global e a comunicação HTTP.
2. **Mover Chamadas de API (`fetch` / `axios`)**:
   - Retire requisições assíncronas de dentro dos componentes/useEffect e centralize em métodos do ViewModel com tratamento de erro e feedback visual.
3. **Mapeamento DB ➔ Frontend**:
   - Mantenha funções de conversão/normalização de payloads (`mapEntityDbToFe`) para proteger as Views contra mudanças no contrato do backend.
4. **Expor Hook Customizado (`useApp` / `useViewModel`)**:
   - Exporte um hook desacoplado para permitir que as Views consumam estados e ações de forma limpa.

---

### **Fase 5: Adaptar e Migrar as Views (`src/views/`)**

1. **Migrar Componentes Visuais**:
   - Transfira páginas, telas de login, dashboards, modais e componentes reutilizáveis para `src/views/`.
2. **Desacoplar Lógica de Rede e Estado Duplicado**:
   - Substitua chamadas diretas de API e `useState` duplicados pelo consumo do hook do ViewModel (`useApp()`).
3. **Preservar Estilização e UX Original**:
   - Garanta que todo a estilização (Bootstrap, Tailwind, etc.) e o comportamento responsivo permanecem idênticos.

---

### **Fase 6: Roteamento Centralizado (`App.jsx` / `main.jsx`)**

1. **Configurar Ponto de Entrada (`main.jsx`)**:
   - Importe os arquivos CSS/JS globais e encapsule a aplicação com o provedor de contexto (`<AppProvider>`).
2. **Ajustar Roteamento (`App.jsx`)**:
   - Ajuste o roteador (seja por React Router ou controle de estado dinâmico) garantindo guardas de autenticação, autorização por perfil e telas de setup inicial.

---

### **Fase 7: Testes Automatizados & Validação de Integridade (Obrigatório)**

1. **Atualizar / Executar Suíte de Testes Existente**:
   - Execute `npm test` ou equivalente para garantir que 100% dos testes passam após a reorganização dos caminhos de importação.
2. **Criar Testes Automatizados se Não Existirem**:
   - Caso o projeto alvo não possua testes automatizados, crie testes de unidade e integração para:
     - **Model**: Validações de dados e funções fabris.
     - **ViewModel**: Alterações de estado e simulação de chamadas HTTP.
3. **Validação de Compilação & Build**:
   - Execute o script de build (`npm run build` ou `npx tsc`) para assegurar zero erros de sintaxe, tipos ou imports não resolvidos.
