import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DeveloperDashboardView } from "./DeveloperDashboardView";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test("serviços sem verificação não aparecem como saudáveis", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/health") return { ok: true, json: async () => ({ dependencies: { database: "connected" } }) };
    throw new Error("Ollama inacessível");
  }));
  render(<DeveloperDashboardView />);
  await waitFor(() => expect(screen.getAllByText("Saudável")).toHaveLength(3));
  expect(screen.getAllByText("Não verificado")).toHaveLength(3);
  expect(screen.queryByText("Verificando")).not.toBeInTheDocument();
});

test("falha do backend não deixa a verificação presa nem presume falha do banco", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Rede indisponível"); }));
  render(<DeveloperDashboardView />);
  await screen.findByText("Indisponível");
  expect(screen.getAllByText("Não verificado")).toHaveLength(4);
  expect(screen.getAllByText("Saudável")).toHaveLength(1);
  expect(screen.queryByText("Verificando")).not.toBeInTheDocument();
});
