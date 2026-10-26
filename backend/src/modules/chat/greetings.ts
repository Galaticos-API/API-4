const GREETING_PHRASES = new Set([
  "oi",
  "ola",
  "e ai",
  "eae",
  "hey",
  "hello",
  "hi",
  "bom dia",
  "boa tarde",
  "boa noite",
  "tudo bem",
  "como vai",
]);

/** Identifica somente cumprimentos isolados; mensagens com perguntas seguem para o RAG. */
export function isGreetingOnly(message: string): boolean {
  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, " ")
    .replace(/[!?.,;:…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return GREETING_PHRASES.has(normalized);
}

export const GREETING_REPLY =
  "Olá! Sou o assistente Sinapse. Posso ajudar você a encontrar informações e decisões registradas no acervo do projeto. O que gostaria de saber?";
