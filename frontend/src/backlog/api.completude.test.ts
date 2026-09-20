import { expect, it } from "vitest";
import { hasCompletudeIndicator } from "./api";

it("considera 0% como indicador válido e oculta somente quando a pontuação é nula", () => {
  expect(hasCompletudeIndicator(0)).toBe(true);
  expect(hasCompletudeIndicator(37)).toBe(true);
  expect(hasCompletudeIndicator(null)).toBe(false);
});
