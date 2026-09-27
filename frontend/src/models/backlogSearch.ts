import type { BacklogItemType, SearchPathNode } from "../api/api_backlog_search";

export const TYPE_LABEL: Record<BacklogItemType, string> = {
  epico: "Épico",
  feature: "Feature",
  pbi: "PBI",
};

export interface TextPart {
  text: string;
  match: boolean;
}

export function highlightParts(text: string, ranges: Array<[number, number]>): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const [from, to] of [...ranges].sort((left, right) => left[0] - right[0])) {
    const start = Math.max(from, cursor);
    const end = Math.min(to, text.length);
    if (start >= end) continue;
    if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false });
    parts.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts.length > 0 ? parts : [{ text, match: false }];
}

export function nodeHref(projectId: string, path: SearchPathNode[], index: number): string {
  const segments = [`/projects/${projectId}`];
  for (const node of path.slice(0, index + 1)) {
    segments.push(node.tipo === "epico" ? `epics/${node.id}` : node.tipo === "feature" ? `features/${node.id}` : `pbis/${node.id}`);
  }
  return segments.join("/");
}

export function isSearchQuery(query: string, minimum: number): boolean {
  return query.trim().length >= minimum;
}

export function summarize(total: number, shown: number, query: string): string {
  if (total === 0) return `Nenhum resultado para “${query}”.`;
  const noun = total === 1 ? "resultado" : "resultados";
  return shown < total ? `Mostrando ${shown} de ${total} ${noun} para “${query}”.` : `${total} ${noun} para “${query}”.`;
}
