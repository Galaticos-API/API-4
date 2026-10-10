import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminView } from "./AdminView";

const project = { id: "a0000000-0000-4000-8000-000000000001", nome: "Projeto escolhido", cliente: "Teste", descricao: "", status: "ativo" };
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("exige escolha explícita, envia o projeto e informa carga idempotente sem prometer reindexação", async () => {
  let loads = 0;
  const request = vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("/projects?")) return json({ items: [project, { ...project, id: "archived", nome: "Arquivado", status: "arquivado" }], total: 2, limit: 50, offset: 0 });
    if (url.endsWith("/admin/demo-seed")) {
      expect(JSON.parse(init!.body as string)).toEqual({ projeto_id: project.id });
      loads++;
      return json({ inseridos: loads === 1 ? 2 : 0, message: loads === 1 ? "Dados demonstrativos carregados." : "Este projeto já possui a carga demonstrativa." });
    }
    return json({ projetos: 1, epicos: 0, features: 0, pbis: 0, documentos: 0, chunksIndexados: 0, statusSistema: "operacional" });
  });
  vi.stubGlobal("fetch", request);
  render(<AdminView />);
  const button = screen.getByRole("button", { name: "Carregar demonstração" });
  expect(button).toBeDisabled();
  await screen.findByRole("option", { name: project.nome });
  expect(screen.queryByRole("option", { name: "Arquivado" })).toBeNull();
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Projeto de destino"), { target: { value: project.id } });
  fireEvent.click(button);
  await screen.findByText("Dados demonstrativos carregados.");
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await screen.findByText("Este projeto já possui a carga demonstrativa.");
  expect(loads).toBe(2);
  expect(screen.getByText(/Esta operação não indexa documentos nem gera vetores/)).toBeInTheDocument();
});

it("exibe o erro do backend quando o projeto foi arquivado após a seleção", async () => {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url.includes("/projects?")) return json({ items: [project], total: 1, limit: 50, offset: 0 });
    if (url.endsWith("/admin/demo-seed")) return json({ error: "Projeto arquivado é somente leitura." }, 409);
    return json({});
  }));
  render(<AdminView />);
  await screen.findByRole("option", { name: project.nome });
  fireEvent.change(screen.getByLabelText("Projeto de destino"), { target: { value: project.id } });
  fireEvent.click(screen.getByRole("button", { name: "Carregar demonstração" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Projeto arquivado é somente leitura.");
});
