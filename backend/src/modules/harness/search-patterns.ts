export function searchPatterns(question: string): string[] {
  const terms = question
    .toLocaleLowerCase("pt-BR")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 4);
  return [...new Set(terms)]
    .slice(0, 6)
    .map((term) => `%${term.replace(/[\\%_]/g, "\\$&")}%`);
}
