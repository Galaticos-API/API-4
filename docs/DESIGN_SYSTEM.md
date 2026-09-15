### 1. Resumo da Extração
- Design System extraído utilizando a URL da landing page do cliente, e algumas capturas de tela.

---

### 2. Design Tokens

#### Paleta de Cores

| Token Semântico | Valor HEX | Valor RGB | Aplicação |
| :--- | :--- | :--- | :--- |
| `surface-base` | `#0A0D14` | `rgb(10, 13, 20)` | Fundo principal da página (Dark Blue/Black). |
| `brand-primary` | `#F97316` | `rgb(249, 115, 22)` | Botões de CTA, bordas de badges, ícones de destaque. |
| `text-primary` | `#FFFFFF` | `rgb(255, 255, 255)` | Títulos principais (H1, H2), navegação e textos em botões/cards. |
| `text-secondary` | `#9CA3AF` | `rgb(156, 163, 175)` | Subtítulos e textos descritivos sob os títulos principais. |
| `step-1` | `#F28C68` | `rgb(242, 140, 104)` | Fundo da etapa "01 Descobrimos". |
| `step-2` | `#D97354` | `rgb(217, 115, 84)` | Fundo da etapa "02 Projetamos". |
| `step-3` | `#BD5A40` | `rgb(189, 90, 64)` | Fundo da etapa "03 Construímos". |
| `step-4` | `#944230` | `rgb(148, 66, 48)` | Fundo da etapa "04 Implantamos". |
| `step-5` | `#6E2D22` | `rgb(110, 45, 34)` | Fundo da etapa "05 Evoluímos". |

#### Tipografia
A interface utiliza uma tipografia geométrica e sem serifa moderna.
- **Família Principal:** `font-sans: 'Inter', system-ui, -apple-system, sans-serif`
- **Escala de Tamanhos:**
  - `text-xs` (12px): Badges informativos (ex: "CONHEÇA NOSSO ECOSSISTEMA").
  - `text-sm` (14px): Links de navegação do header e numeração dos steps.
  - `text-base` (16px): Corpo de texto nos cards e botões.
  - `text-xl` (20px): Subtítulos descritivos no header.
  - `text-3xl` (30px): Títulos de seções (ex: "Nossa forma de transformar...").
  - `text-6xl` (60px): Título principal (Hero Section).
- **Pesos (Font-Weight):**
  - `Regular (400)`: Corpo de texto.
  - `Medium (500)`: Links de menu e botões.
  - `Bold (700)`: Títulos H1 e H2.

#### Espaçamentos & Bordas
- **Raios de Borda (Border-Radius):**
  - `radius-full` (9999px): Botões e badges estilo pílula.
  - `radius-md` (8px): Envoltório geral (container) da seção de cards.
- **Espaçamentos Internos (Paddings):**
  - `spacing-sm` (8px 16px): Badges outline.
  - `spacing-md` (12px 24px): Botão de CTA da Navbar.
  - `spacing-lg` (16px 32px): Botão de CTA Principal do Hero.
  - `spacing-xl` (40px 24px): Padding interno dos cards da esteira de processos.

---

### 3. Componentes Base (UI Kit)

#### Botão Primário (Solid)
Aplicado no Call to Action principal ("Quero Transformar Minha Empresa") e na Navbar ("Fale com o nosso agente").
- **Default:**
  - `background-color: var(--brand-primary);`
  - `color: var(--text-primary);`
  - `border-radius: var(--radius-full);`
  - `padding: 16px 32px;`
  - `font-weight: 500;`
  - `display: flex; align-items: center; justify-content: center; gap: 8px;`
- **Hover (Sugerido):**
  - `background-color: #EA580C;`
  - `transition: all 0.2s ease-in-out;`

#### Badge Outline
Utilizado como marcador de topo ("CONHEÇA NOSSO ECOSSISTEMA AI-FIRST").
- **Estrutura:**
  - `background-color: transparent;`
  - `border: 1px solid var(--brand-primary);`
  - `color: var(--brand-primary);`
  - `border-radius: var(--radius-full);`
  - `padding: 6px 16px;`
  - `font-size: 12px;`
  - `text-transform: uppercase;`
  - `letter-spacing: 0.05em;`

#### Card de Processo (Stepper)
Os módulos visíveis na imagem da esteira de 5 passos formam um grid sem margens internas entre colunas, apenas variando o background.
- **Estrutura Base do Módulo:**
  - `display: flex; flex-direction: column; align-items: center; text-align: center;`
  - `padding: 40px 24px;`
- **Indicador Numérico Superior ("01", "02"):**
  - `width: 48px; height: 48px;`
  - `border: 2px solid rgba(255, 255, 255, 0.4);`
  - `border-radius: 50%;`
  - `display: flex; align-items: center; justify-content: center;`
  - `margin-bottom: 24px;`

---

### 4. Código de Integração

**Variáveis CSS Globais (`:root`)**
```css
:root {
  /* Cores */
  --surface-base: #0A0D14;
  --brand-primary: #F97316;
  --text-primary: #FFFFFF;
  --text-secondary: #9CA3AF;
  
  --step-1: #F28C68;
  --step-2: #D97354;
  --step-3: #BD5A40;
  --step-4: #944230;
  --step-5: #6E2D22;

  /* Tipografia */
  --font-sans: 'Inter', system-ui, sans-serif;
  
  /* Bordas */
  --radius-full: 9999px;
  --radius-md: 8px;
}
```

**Integração Tailwind CSS (`tailwind.config.js`)**
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          base: '#0A0D14',
        },
        brand: {
          primary: '#F97316',
        },
        step: {
          1: '#F28C68',
          2: '#D97354',
          3: '#BD5A40',
          4: '#944230',
          5: '#6E2D22',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      textColor: {
        primary: '#FFFFFF',
        secondary: '#9CA3AF',
      }
    },
  },
  plugins: [],
}
```

### 5. Entrega obrigatória do protótipo no Figma

O protótipo navegável da PRE-05 deve ser entregue em um arquivo editável do Figma.
O código React e as capturas de tela servem como apoio para validação, mas não
substituem o arquivo de design compartilhado com o time e o cliente.

#### Fluxo mínimo a prototipar

1. Login e retorno para a área interna.
2. Lista de projetos e estado vazio.
3. Cadastro de projeto com estados válido, inválido, carregando e erro.
4. Navegação Projeto → Épico → Feature → PBI.
5. Tela de detalhe/edição de PBI com critérios de aceitação.

#### Critérios para considerar a PRE-05 pronta

- O arquivo Figma possui páginas ou seções identificadas para o fluxo principal.
- O Design System contém tokens, componentes reutilizáveis e estados de interface.
- O protótipo tem conexões clicáveis entre as telas do fluxo principal.
- As telas contemplam desktop e uma variação responsiva.
- O link do Figma permite visualização e comentários do time e do PO.
- O cartão da PRE-05 contém o link do arquivo, evidências e a validação do PO.

**Link do arquivo Figma:** deve ser preenchido no cartão da PRE-05 assim que
Giovanni e Emmanuel criarem ou receberem acesso de edição ao arquivo do time.
