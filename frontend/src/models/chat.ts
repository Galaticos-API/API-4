import type { ChatOrigin } from "../api/api_chat";

export function formatRelative(value: string | null | undefined, now: number = Date.now()): string {
  if (!value) return "";
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return new Date(time).toLocaleDateString("pt-BR");
}

export function formatClock(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export const ORIGIN_BADGE: Record<ChatOrigin, string | null> = {
  assistente: null,
  busca_textual: "Busca textual",
  sem_resultado: null,
};

export const SUGGESTED_PROMPTS: readonly string[] = [
  "Quais decisões já foram tomadas neste projeto?",
  "Resuma o escopo e os critérios de aceitação principais.",
  "Que riscos ou dependências aparecem na documentação?",
];

export function remainingCharacters(text: string, max: number): number {
  return max - text.length;
}
