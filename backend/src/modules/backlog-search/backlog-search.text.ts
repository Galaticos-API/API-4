import type { SearchSnippet } from "./backlog-search.types.js";

const MARKS = /[̀-ͯ]/g;
const SNIPPET_RADIUS = 70;

export function foldChar(character: string): string {
  const folded = character.normalize("NFD").replace(MARKS, "").toLowerCase();
  return folded.length === 1 ? folded : character.toLowerCase().slice(0, 1) || character;
}

export function fold(text: string): string {
  let result = "";
  for (let index = 0; index < text.length; index += 1) result += foldChar(text[index]);
  return result;
}

export function parseTerms(query: string): string[] {
  const words = fold(query.normalize("NFC"))
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const unique = [...new Set(words)];
  const meaningful = unique.filter((word) => word.length >= 2);
  return (meaningful.length > 0 ? meaningful : []).slice(0, 6);
}

export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}

export function likePatterns(terms: string[]): string[] {
  return terms.map((term) => `%${escapeLike(term)}%`);
}

function collapse(text: string): string {
  let result = "";
  for (let index = 0; index < text.length; index += 1) result += /\s/.test(text[index]) ? " " : text[index];
  return result;
}

function highlights(folded: string, terms: string[], offset: number, length: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    let from = offset;
    while (from < offset + length) {
      const index = folded.indexOf(term, from);
      if (index < 0 || index >= offset + length) break;
      ranges.push([index - offset, Math.min(index + term.length, offset + length) - offset]);
      from = index + Math.max(term.length, 1);
    }
  }
  ranges.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

export function makeSnippet(source: string, terms: string[], wholeText: boolean): SearchSnippet {
  const text = collapse(source).trim();
  const folded = fold(text);

  if (wholeText || text.length <= SNIPPET_RADIUS * 2) {
    return { texto: text, destaques: highlights(folded, terms, 0, text.length) };
  }

  const first = terms
    .map((term) => folded.indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? 0;

  let start = Math.max(0, first - SNIPPET_RADIUS);
  let end = Math.min(text.length, first + SNIPPET_RADIUS);
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space >= 0 && space < first) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space > first) end = space;
  }

  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return {
    texto: `${prefix}${text.slice(start, end)}${suffix}`,
    destaques: highlights(folded, terms, start, end - start).map(([from, to]) => [from + prefix.length, to + prefix.length] as [number, number]),
  };
}
