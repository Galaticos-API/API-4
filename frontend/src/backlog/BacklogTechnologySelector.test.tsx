// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BacklogTechnologySelector } from "../views/backlog/BacklogTechnologySelector";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("carrega o catálogo e propaga associações sem duplicatas", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url !== "/api/v1/technologies") throw new Error(`Requisição inesperada: ${url}`);
    return new Response(JSON.stringify({ items: [
      { id: "tech-react", nome: "React" },
      { id: "tech-node", nome: "Node.js" },
    ] }), { status: 200 });
  }));
  const onChange = vi.fn();

  render(<BacklogTechnologySelector value={["tech-react"]} onChange={onChange} />);

  expect(await screen.findByLabelText("React")).toBeTruthy();
  const react = screen.getByLabelText("React") as HTMLInputElement;
  const node = screen.getByLabelText("Node.js") as HTMLInputElement;
  expect(react.checked).toBe(true);
  fireEvent.click(node);
  expect(onChange).toHaveBeenCalledWith(["tech-react", "tech-node"]);
  fireEvent.click(react);
  expect(onChange).toHaveBeenLastCalledWith([]);
});

it("expõe erro do catálogo e permite tentar novamente", async () => {
  const fetchMock = vi.fn()
    .mockRejectedValueOnce(new Error("indisponível"))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  render(<BacklogTechnologySelector value={[]} onChange={() => undefined} />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText("Nenhuma tecnologia cadastrada no catálogo.")).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
