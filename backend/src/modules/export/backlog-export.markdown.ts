import type {
  ExportEpic,
  ExportEpicRef,
  ExportFeature,
  ExportPbi,
  ExportScenario,
  ExportTextCriterion,
  MarkdownDocument,
} from "./backlog-export.types.js";

// Gerador puro do Markdown exportado (S3-15 / PBI-01.5.5). Reproduz a estrutura dos
// arquivos docs/backlog/EP-*.md, que seguem o Guia de Especificação de Itens de Trabalho
// da PRO4TECH. O separador dos títulos e dos cenários é o mesmo travessão usado no guia;
// fica isolado aqui como escape Unicode para não aparecer em nenhum outro texto.
const GUIDE_SEPARATOR = " \u2014 ";
const DOT = " · ";
const NOT_INFORMED = "_Não informado._";

export const ARCHIVED_STATUS = "arquivado";

const isActive = (item: { status: string }) => item.status !== ARCHIVED_STATUS;

const pad = (value: number) => String(value).padStart(2, "0");

export function epicCode(epic: Pick<ExportEpicRef, "numero">): string {
  return `EP-${pad(epic.numero)}`;
}

export function featureCode(epic: Pick<ExportEpicRef, "numero">, feature: Pick<ExportFeature, "numero">): string {
  return `FT-${pad(epic.numero)}.${feature.numero}`;
}

export function pbiCode(
  epic: Pick<ExportEpicRef, "numero">,
  feature: Pick<ExportFeature, "numero">,
  pbi: Pick<ExportPbi, "numero">,
): string {
  return `PBI-${pad(epic.numero)}.${feature.numero}.${pbi.numero}`;
}

/**
 * Escapa o texto digitado pelo usuário para que ele não seja interpretado como
 * marcação: ênfase, código, links, HTML, tabelas e marcadores de bloco no início da linha.
 */
export function escapeMarkdownText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const escaped = line.trim().replace(/[\\`*_[\]<>|~#]/g, (char) => `\\${char}`);
      return escaped
        .replace(/^([+\-=])/, "\\$1")
        .replace(/^(\d+)([.)])(?=\s|$)/, "$1\\$2");
    })
    .join("\n");
}

/** Texto de uma linha só (títulos, história, blocos BDD): quebras viram espaço. */
function inline(value: string | null | undefined): string {
  return escapeMarkdownText(String(value ?? "").replace(/\s+/g, " ").trim());
}

/** Texto livre de várias linhas: preserva parágrafos e remove linhas vazias repetidas. */
function block(value: string | null | undefined): string {
  const text = escapeMarkdownText(String(value ?? "").trim());
  return text.replace(/\n{3,}/g, "\n\n");
}

function hasText(value: string | null | undefined): boolean {
  return String(value ?? "").trim().length > 0;
}

function orFallback(value: string | null | undefined, render: (text: string) => string = block): string {
  return hasText(value) ? render(String(value)) : NOT_INFORMED;
}

/** Escopo macro com mais de uma linha vira lista, como nos épicos do guia. */
function macroScope(value: string | null | undefined): string {
  if (!hasText(value)) return NOT_INFORMED;
  const lines = String(value)
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^([-*+•]|\d+[.)])\s+/, ""))
    .filter(Boolean);
  if (lines.length === 1) return block(lines[0]);
  return lines.map((line) => `- ${inline(line)}`).join("\n");
}

function byOrder<T extends { ordem: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.ordem - b.ordem);
}

function byNumber<T extends { numero: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.numero - b.numero);
}

function priority(value: string | null | undefined): string {
  return hasText(value) ? `\`${String(value).replace(/`/g, "").trim()}\`` : "";
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function textCriteria(criterios: ExportTextCriterion[], emptyMessage: string): string {
  const items = byOrder(criterios).filter((criterion) => hasText(criterion.texto));
  if (items.length === 0) return emptyMessage;
  return items.map((criterion) => `- ${inline(criterion.texto)}`).join("\n");
}

function scenario(item: ExportScenario, position: number): string {
  const name = hasText(item.nome) ? `${GUIDE_SEPARATOR}${inline(item.nome)}` : "";
  return [
    `**Cenário ${position}${name}**`,
    `DADO ${inline(item.dado)}`,
    `QUANDO ${inline(item.quando)}`,
    `ENTÃO ${inline(item.entao)}`,
  ].join("\n");
}

function renderPbi(epic: ExportEpicRef, feature: ExportFeature, pbi: ExportPbi): string {
  const heading = `### ${pbiCode(epic, feature, pbi)}${GUIDE_SEPARATOR}${inline(pbi.titulo)}`;
  const tag = priority(pbi.prioridade);
  const parts = [
    tag ? `${heading}${DOT}${tag}` : heading,
    [
      `COMO UM ${inline(pbi.historia_como_um)}`,
      `EU QUERO ${inline(pbi.historia_eu_quero)}`,
      `PARA QUE ${inline(pbi.historia_para_que)}`,
    ].join("\n"),
  ];
  const scenarios = byOrder(pbi.cenarios);
  if (scenarios.length === 0) parts.push("_Nenhum cenário de aceitação registrado._");
  else scenarios.forEach((item, index) => parts.push(scenario(item, index + 1)));
  if (hasText(pbi.regras_observacoes)) parts.push(`**Regras e observações.** ${block(pbi.regras_observacoes)}`);
  return parts.join("\n\n");
}

function renderFeatureSection(epic: ExportEpicRef, feature: ExportFeature): string {
  const pbis = byNumber(feature.pbis.filter((pbi) => isActive(pbi) && pbi.feature_id === feature.id));
  const summary = [
    hasText(feature.prioridade) ? `**Prioridade** ${priority(feature.prioridade)}` : "",
    plural(pbis.length, "PBI", "PBIs"),
  ].filter(Boolean).join(DOT);
  const parts = [
    `## ${featureCode(epic, feature)}${GUIDE_SEPARATOR}${inline(feature.titulo)}`,
    summary,
    `**Descrição.** ${orFallback(feature.descricao)}`,
    `**Objetivo.** ${orFallback(feature.objetivo)}`,
    `**Critérios de aceitação**\n\n${textCriteria(feature.criterios, "_Nenhum critério de aceitação registrado._")}`,
    ...pbis.map((pbi) => renderPbi(epic, feature, pbi)),
  ];
  return parts.join("\n\n");
}

function activeFeatures(epic: ExportEpic): ExportFeature[] {
  return byNumber(epic.features.filter((feature) => isActive(feature) && feature.epico_id === epic.id));
}

/** Épico completo: cabeçalho do guia, depois cada feature ativa com seus PBIs ativos. */
export function renderEpicMarkdown(epic: ExportEpic): string {
  const features = activeFeatures(epic);
  const pbiCount = features.reduce(
    (total, feature) => total + feature.pbis.filter((pbi) => isActive(pbi) && pbi.feature_id === feature.id).length,
    0,
  );
  const summary = [
    hasText(epic.prioridade) ? `**Prioridade:** ${priority(epic.prioridade)}` : "",
    `**${plural(features.length, "feature", "features")}**`,
    `**${plural(pbiCount, "PBI", "PBIs")}**`,
  ].filter(Boolean).join(DOT);
  const header = [
    `# ${epicCode(epic)}${GUIDE_SEPARATOR}${inline(epic.titulo)}`,
    summary,
    `## Descrição\n\n${orFallback(epic.descricao)}`,
    `## Objetivo\n\n${orFallback(epic.objetivo)}`,
    `## Escopo macro\n\n${macroScope(epic.escopo_macro)}`,
    `## Resultado esperado\n\n${orFallback(epic.resultado_esperado)}`,
    `## Critérios de aceitação\n\n${textCriteria(epic.criterios, "_Nenhum critério de aceitação registrado._")}`,
  ].join("\n\n");
  const sections = features.map((feature) => renderFeatureSection(epic, feature));
  return `${[header, ...sections].join("\n\n---\n\n")}\n`;
}

/**
 * Feature isolada: só a feature e os seus PBIs. A única referência ao épico é a linha
 * de rastreabilidade exigida pelo guia (ao ler uma feature deve ser possível saber qual
 * parte do épico ela realiza); nenhum conteúdo do épico ou de outras features entra.
 */
export function renderFeatureMarkdown(epic: ExportEpicRef, feature: ExportFeature): string {
  const origin = `**Épico de origem:** ${epicCode(epic)}${GUIDE_SEPARATOR}${inline(epic.titulo)}`;
  return `${origin}\n\n${renderFeatureSection(epic, feature)}\n`;
}

/** Nome de arquivo ASCII seguro: código do item e título sem acentos. */
export function exportFilename(code: string, title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${code}${slug ? `-${slug}` : ""}.md`;
}

export function epicMarkdownDocument(epic: ExportEpic): MarkdownDocument {
  return { filename: exportFilename(epicCode(epic), epic.titulo), content: renderEpicMarkdown(epic) };
}

export function featureMarkdownDocument(epic: ExportEpicRef, feature: ExportFeature): MarkdownDocument {
  return {
    filename: exportFilename(featureCode(epic, feature), feature.titulo),
    content: renderFeatureMarkdown(epic, feature),
  };
}
