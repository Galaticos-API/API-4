import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeMarkdownText,
  epicMarkdownDocument,
  exportFilename,
  featureMarkdownDocument,
  renderEpicMarkdown,
  renderFeatureMarkdown,
} from "./backlog-export.markdown.js";
import type { ExportEpic, ExportFeature, ExportPbi } from "./backlog-export.types.js";

const SEP = " \u2014 ";

function pbi(overrides: Partial<ExportPbi> & Pick<ExportPbi, "id" | "feature_id" | "numero" | "titulo">): ExportPbi {
  return {
    prioridade: "Must",
    status: "rascunho",
    historia_como_um: "Product Owner",
    historia_eu_quero: "exportar a especificação",
    historia_para_que: "eu possa compartilhá-la",
    regras_observacoes: null,
    cenarios: [],
    ...overrides,
  };
}

function feature(overrides: Partial<ExportFeature> & Pick<ExportFeature, "id" | "numero" | "titulo">): ExportFeature {
  return {
    epico_id: "epic-1",
    descricao: "Descrição da feature.",
    objetivo: "Objetivo da feature.",
    prioridade: "Should",
    status: "rascunho",
    criterios: [],
    pbis: [],
    ...overrides,
  };
}

function epic(overrides: Partial<ExportEpic> = {}): ExportEpic {
  return {
    id: "epic-1",
    numero: 1,
    titulo: "Especificar o backlog",
    status: "rascunho",
    descricao: "Descrição do épico.",
    objetivo: "Objetivo do épico.",
    escopo_macro: "Cadastro da hierarquia\nVerificação de conformidade",
    resultado_esperado: "O PO especifica tudo na plataforma.",
    prioridade: "Must",
    criterios: [{ ordem: 2, texto: "Segundo critério do épico" }, { ordem: 1, texto: "Primeiro critério do épico" }],
    features: [],
    ...overrides,
  };
}

const fullEpic = () => epic({
  features: [
    feature({
      id: "feature-2", numero: 2, titulo: "Navegação do backlog",
      pbis: [pbi({ id: "pbi-21", feature_id: "feature-2", numero: 1, titulo: "Filtrar itens" })],
    }),
    feature({
      id: "feature-1", numero: 1, titulo: "Estruturação dos itens",
      criterios: [{ ordem: 1, texto: "Cada nível tem os campos do guia" }],
      pbis: [
        pbi({
          id: "pbi-12", feature_id: "feature-1", numero: 2, titulo: "Cadastrar épico", prioridade: "Should",
          regras_observacoes: "Campos obrigatórios conforme o guia.",
          cenarios: [
            { ordem: 2, nome: "Salvar rascunho", dado: "um épico incompleto", quando: "eu salvar", entao: "o rascunho é preservado" },
            { ordem: 1, nome: "Criar épico completo", dado: "um projeto ativo", quando: "eu confirmar", entao: "o épico é criado" },
          ],
        }),
        pbi({ id: "pbi-11", feature_id: "feature-1", numero: 1, titulo: "Cadastrar projeto" }),
      ],
    }),
  ],
});

test("épico com várias features segue a estrutura e a ordem do guia", () => {
  const markdown = renderEpicMarkdown(fullEpic());
  const expected = [
    `# EP-01${SEP}Especificar o backlog`,
    "**Prioridade:** `Must` · **2 features** · **3 PBIs**",
    "## Descrição", "## Objetivo", "## Escopo macro",
    "- Cadastro da hierarquia\n- Verificação de conformidade",
    "## Resultado esperado",
    "## Critérios de aceitação\n\n- Primeiro critério do épico\n- Segundo critério do épico",
    `## FT-01.1${SEP}Estruturação dos itens`,
    "**Descrição.** Descrição da feature.",
    "**Objetivo.** Objetivo da feature.",
    "**Critérios de aceitação**\n\n- Cada nível tem os campos do guia",
    `### PBI-01.1.1${SEP}Cadastrar projeto · \`Must\`\n\nCOMO UM Product Owner\nEU QUERO exportar a especificação\nPARA QUE eu possa compartilhá-la`,
    `### PBI-01.1.2${SEP}Cadastrar épico · \`Should\``,
    `**Cenário 1${SEP}Criar épico completo**\nDADO um projeto ativo\nQUANDO eu confirmar\nENTÃO o épico é criado`,
    `**Cenário 2${SEP}Salvar rascunho**`,
    "**Regras e observações.** Campos obrigatórios conforme o guia.",
    `## FT-01.2${SEP}Navegação do backlog`,
    `### PBI-01.2.1${SEP}Filtrar itens`,
  ];
  let cursor = -1;
  for (const fragment of expected) {
    const position = markdown.indexOf(fragment);
    assert.ok(position > cursor, `trecho fora de ordem ou ausente: ${fragment}`);
    cursor = position;
  }
  assert.equal((markdown.match(/\n---\n/g) ?? []).length, 2, "um separador antes de cada feature");
  assert.ok(markdown.endsWith("\n"));
});

test("feature isolada contém somente ela e seus PBIs", () => {
  const source = fullEpic();
  const target = source.features.find((item) => item.id === "feature-1")!;
  const markdown = renderFeatureMarkdown(source, {
    ...target,
    pbis: [...target.pbis, pbi({ id: "intruso", feature_id: "feature-2", numero: 9, titulo: "Item de outra feature" })],
  });
  assert.ok(markdown.startsWith(`**Épico de origem:** EP-01${SEP}Especificar o backlog\n\n## FT-01.1${SEP}Estruturação dos itens`));
  assert.ok(markdown.includes(`### PBI-01.1.1${SEP}Cadastrar projeto`));
  assert.ok(markdown.includes(`### PBI-01.1.2${SEP}Cadastrar épico`));
  for (const leaked of ["Navegação do backlog", "Filtrar itens", "Item de outra feature", "## Descrição", "Primeiro critério do épico", "Descrição do épico"]) {
    assert.ok(!markdown.includes(leaked), `não deve vazar: ${leaked}`);
  }
  assert.ok(!markdown.startsWith("# "), "não repete o cabeçalho do épico");
});

test("épico ignora features de outro épico mesmo que cheguem na árvore", () => {
  const markdown = renderEpicMarkdown(epic({
    features: [feature({ id: "alheia", epico_id: "outro-epico", numero: 1, titulo: "Feature alheia" })],
  }));
  assert.ok(!markdown.includes("Feature alheia"));
  assert.ok(markdown.includes("**0 features**"));
});

test("PBI sem critérios e campos vazios ficam explícitos, sem regras e observações", () => {
  const markdown = renderEpicMarkdown(epic({
    descricao: null, escopo_macro: "  ", criterios: [],
    features: [feature({
      id: "feature-1", numero: 1, titulo: "Feature", objetivo: null,
      pbis: [pbi({ id: "pbi-1", feature_id: "feature-1", numero: 1, titulo: "Consultar itens", regras_observacoes: "   " })],
    })],
  }));
  assert.ok(markdown.includes("## Descrição\n\n_Não informado._"));
  assert.ok(markdown.includes("## Escopo macro\n\n_Não informado._"));
  assert.ok(markdown.includes("## Critérios de aceitação\n\n_Nenhum critério de aceitação registrado._"));
  assert.ok(markdown.includes("**Objetivo.** _Não informado._"));
  assert.ok(markdown.includes("PARA QUE eu possa compartilhá-la\n\n_Nenhum cenário de aceitação registrado._"));
  assert.ok(!markdown.includes("Regras e observações"));
});

test("caracteres especiais de Markdown são escapados no texto do usuário", () => {
  const markdown = renderEpicMarkdown(epic({
    titulo: "Pedido #12 *urgente* [ver] <b>",
    descricao: "# não é título\n- não é lista\n1. não é numerada\n> não é citação\nuso de `código` e a|b e _x_",
    features: [feature({
      id: "feature-1", numero: 1, titulo: "Feature",
      pbis: [pbi({
        id: "pbi-1", feature_id: "feature-1", numero: 1, titulo: "Validar **senha**",
        cenarios: [{ ordem: 1, nome: "Caso [a]", dado: "o campo `x`", quando: "eu digitar\n<script>", entao: "o sistema recusa" }],
      })],
    })],
  }));
  assert.ok(markdown.startsWith(`# EP-01${SEP}Pedido \\#12 \\*urgente\\* \\[ver\\] \\<b\\>`));
  assert.ok(markdown.includes("\\# não é título\n\\- não é lista\n1\\. não é numerada\n\\> não é citação\nuso de \\`código\\` e a\\|b e \\_x\\_"));
  assert.ok(markdown.includes(`### PBI-01.1.1${SEP}Validar \\*\\*senha\\*\\*`));
  assert.ok(markdown.includes(`**Cenário 1${SEP}Caso \\[a\\]**\nDADO o campo \\\`x\\\`\nQUANDO eu digitar \\<script\\>\nENTÃO o sistema recusa`));
  assert.ok(!markdown.includes("<script>"));
  assert.equal(escapeMarkdownText("+ item\n= linha\nback\\slash"), "\\+ item\n\\= linha\nback\\\\slash");
});

test("itens arquivados são excluídos sem renumerar os demais", () => {
  const source = epic({
    features: [
      feature({ id: "feature-1", numero: 1, titulo: "Feature ativa",
        pbis: [
          pbi({ id: "pbi-1", feature_id: "feature-1", numero: 1, titulo: "PBI arquivado", status: "arquivado" }),
          pbi({ id: "pbi-2", feature_id: "feature-1", numero: 2, titulo: "PBI ativo", status: "concluido" }),
        ] }),
      feature({ id: "feature-2", numero: 2, titulo: "Feature arquivada", status: "arquivado",
        pbis: [pbi({ id: "pbi-3", feature_id: "feature-2", numero: 1, titulo: "PBI da feature arquivada" })] }),
    ],
  });
  const markdown = renderEpicMarkdown(source);
  for (const archived of ["PBI arquivado", "Feature arquivada", "PBI da feature arquivada"]) {
    assert.ok(!markdown.includes(archived), `arquivado exportado: ${archived}`);
  }
  assert.ok(markdown.includes(`### PBI-01.1.2${SEP}PBI ativo`));
  assert.ok(markdown.includes("**1 feature** · **1 PBI**"));
  const isolated = renderFeatureMarkdown(source, source.features[0]);
  assert.ok(!isolated.includes("PBI arquivado"));
  assert.ok(isolated.includes("1 PBI"));
});

test("nome do arquivo usa o código e o título sem acentos", () => {
  assert.equal(exportFilename("EP-01", "Especificar o backlog de produto!"), "EP-01-especificar-o-backlog-de-produto.md");
  assert.equal(exportFilename("FT-01.2", "***"), "FT-01.2.md");
  const source = fullEpic();
  assert.equal(epicMarkdownDocument(source).filename, "EP-01-especificar-o-backlog.md");
  assert.equal(featureMarkdownDocument(source, source.features[1]).filename, "FT-01.1-estruturacao-dos-itens.md");
});

test("o Markdown gerado só usa o travessão nos títulos e cenários do guia", () => {
  const markdown = renderEpicMarkdown(fullEpic());
  const lines = markdown.split("\n").filter((line) => /[\u2013\u2014]/.test(line));
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.match(line, /^(#{1,3} (EP|FT|PBI)-[\d.]+ \u2014 |\*\*Cenário \d+ \u2014 )/, line);
    assert.ok(!line.includes("\u2013"));
  }
});
