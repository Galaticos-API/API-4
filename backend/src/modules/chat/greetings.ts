const GREETING_PHRASES = new Set([
  "oi",
  "ola",
  "opa",
  "eai",
  "e ai",
  "eae",
  "iae",
  "salve",
  "fala",
  "fala ai",
  "hey",
  "hello",
  "hi",
  "yo",
  "bom dia",
  "boa tarde",
  "boa noite",
  "tudo bem",
  "tudo bom",
  "como vai",
  "como voce esta",
  "como voce ta",
  "prazer",
  "obrigado",
  "obrigada",
  "valeu",
  "ate logo",
  "tchau",
]);

const TYPO_VARIANTS = new Map([
  ["oii", "oi"],
  ["ooi", "oi"],
  ["oie", "oi"],
  ["olaa", "ola"],
  ["olae", "ola"],
  ["opa", "opa"],
  ["eaii", "eai"],
  ["eai", "eai"],
  ["eaei", "eae"],
  ["iae", "iae"],
  ["bom diaa", "bom dia"],
  ["boa tardee", "boa tarde"],
  ["boa noitee", "boa noite"],
  ["tudu bem", "tudo bem"],
  ["tudo beem", "tudo bem"],
  ["tudo bomm", "tudo bom"],
  ["com vai", "como vai"],
  ["como vaai", "como vai"],
]);

function normalizeGreeting(message: string): string {
  return message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, " ")
    .replace(/[!?.,;:…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Treat casual emphasis / keyboard repeats as the same word ("oiiii" → "oi").
    .replace(/([a-z])\1{2,}/g, "$1$1");
}

/** Identifica cumprimentos isolados, tolerando erros simples de digitação. */
export function isGreetingOnly(message: string): boolean {
  const normalized = normalizeGreeting(message);
  const canonical = TYPO_VARIANTS.get(normalized) ?? normalized;
  return GREETING_PHRASES.has(canonical);
}

export const GREETING_REPLY =
  "Olá! Sou o assistente Sinapse. Posso ajudar você a encontrar informações e decisões registradas no acervo do projeto. O que gostaria de saber?";
