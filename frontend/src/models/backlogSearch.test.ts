import { expect, it } from "vitest";
import { highlightParts, isSearchQuery, nodeHref, summarize } from "./backlogSearch";

const path = [
  { tipo: "epico" as const, id: "e1", titulo: "Épico", codigo: null },
  { tipo: "feature" as const, id: "f1", titulo: "Feature", codigo: null },
  { tipo: "pbi" as const, id: "p1", titulo: "PBI", codigo: "PBI-1" },
];

it("divide o texto em trechos com e sem destaque", () => {
  expect(highlightParts("Cadastrar usuário", [[10, 17]])).toEqual([
    { text: "Cadastrar ", match: false },
    { text: "usuário", match: true },
  ]);
  expect(highlightParts("abc", [])).toEqual([{ text: "abc", match: false }]);
  expect(highlightParts("abcdef", [[0, 2], [4, 6]]).map((part) => part.text)).toEqual(["ab", "cd", "ef"]);
});

it("ignora faixas inválidas, sobrepostas ou fora do texto", () => {
  expect(highlightParts("abc", [[2, 2], [5, 9]])).toEqual([{ text: "abc", match: false }]);
  expect(highlightParts("abcd", [[0, 3], [1, 4]]).map((part) => [part.text, part.match])).toEqual([["abc", true], ["d", true]]);
});

it("monta os endereços navegáveis de cada segmento do caminho", () => {
  expect(nodeHref("p", path, 0)).toBe("/projects/p/epics/e1");
  expect(nodeHref("p", path, 1)).toBe("/projects/p/epics/e1/features/f1");
  expect(nodeHref("p", path, 2)).toBe("/projects/p/epics/e1/features/f1/pbis/p1");
});

it("resume a quantidade de resultados e valida o tamanho mínimo da busca", () => {
  expect(summarize(0, 0, "x")).toBe("Nenhum resultado para “x”.");
  expect(summarize(1, 1, "login")).toBe("1 resultado para “login”.");
  expect(summarize(80, 50, "login")).toBe("Mostrando 50 de 80 resultados para “login”.");
  expect(isSearchQuery(" a ", 2)).toBe(false);
  expect(isSearchQuery("ab", 2)).toBe(true);
});
