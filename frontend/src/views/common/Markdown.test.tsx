// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Markdown, parseMarkdown } from "./Markdown";

afterEach(cleanup);

it("interpreta títulos, listas, código e citações em blocos", () => {
  const blocks = parseMarkdown("# Título\n\nTexto **forte** e `código`.\n\n- um\n- dois\n\n1. a\n2. b\n\n```ts\nconst x = 1;\n```\n\n> nota\n\n---");
  expect(blocks.map(block => block.kind)).toEqual(["heading", "paragraph", "list", "list", "code", "quote", "rule"]);
  expect(blocks[2]).toEqual({ kind: "list", ordered: false, items: ["um", "dois"] });
  expect(blocks[3]).toEqual({ kind: "list", ordered: true, items: ["a", "b"] });
  expect(blocks[4]).toEqual({ kind: "code", language: "ts", text: "const x = 1;" });
});

it("renderiza estrutura semântica acessível", () => {
  render(<Markdown source={"# Arquitetura\n\nUsa **Node** e `pg`.\n\n- Camada API\n- Camada dados\n\n```\nnpm test\n```"} />);
  expect(screen.getByRole("heading", { name: "Arquitetura" })).toBeInTheDocument();
  expect(screen.getByText("Node").tagName).toBe("STRONG");
  expect(screen.getByText("pg").tagName).toBe("CODE");
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByLabelText("Bloco de código")).toHaveTextContent("npm test");
});

it("não executa HTML nem aceita links inseguros", () => {
  const { container } = render(<Markdown source={"<script>alert(1)</script> [ruim](javascript:alert(1)) [bom](https://exemplo.com/a)"} />);
  expect(container.querySelector("script")).toBeNull();
  expect(container.textContent).toContain("<script>alert(1)</script>");
  const links = container.querySelectorAll("a");
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveAttribute("href", "https://exemplo.com/a");
  expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
});

it("tolera texto vazio e quebras de linha do Windows", () => {
  const { container } = render(<Markdown source="" />);
  expect(container.querySelector(".markdown")?.children).toHaveLength(0);
  expect(parseMarkdown("linha 1\r\nlinha 2")).toEqual([{ kind: "paragraph", text: "linha 1 linha 2" }]);
});
