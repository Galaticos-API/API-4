import { expect, it } from "vitest";
import { ORIGIN_BADGE, formatClock, formatRelative, remainingCharacters } from "./chat";

const NOW = Date.parse("2026-09-25T12:00:00Z");

it("formata tempo relativo em português", () => {
  expect(formatRelative("2026-09-25T11:59:40Z", NOW)).toBe("agora");
  expect(formatRelative("2026-09-25T11:30:00Z", NOW)).toBe("há 30 min");
  expect(formatRelative("2026-09-25T09:00:00Z", NOW)).toBe("há 3 h");
  expect(formatRelative("2026-09-24T09:00:00Z", NOW)).toBe("ontem");
  expect(formatRelative("2026-09-22T09:00:00Z", NOW)).toBe("há 3 dias");
  expect(formatRelative("2026-01-05T09:00:00Z", NOW)).toMatch(/\d{2}\/\d{2}\/2026/);
  expect(formatRelative("", NOW)).toBe("");
  expect(formatRelative("invalida", NOW)).toBe("");
});

it("formata horário e ignora datas inválidas", () => {
  expect(formatClock("2026-09-25T12:34:00Z")).toMatch(/\d{2}:\d{2}/);
  expect(formatClock(null)).toBe("");
  expect(formatClock("x")).toBe("");
});

it("selo de origem e contagem de caracteres", () => {
  expect(ORIGIN_BADGE.assistente).toBeNull();
  expect(ORIGIN_BADGE.busca_textual).toBe("Busca textual");
  expect(ORIGIN_BADGE.sem_resultado).toBeNull();
  expect(remainingCharacters("abc", 10)).toBe(7);
  expect(remainingCharacters("abcd", 3)).toBe(-1);
});
