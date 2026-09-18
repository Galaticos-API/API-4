// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EpicPanel } from "./EpicPanel";

const mockEpicIncomplete = {
  id: "epic-1",
  projeto_id: "project-1",
  titulo: "Épico Rascunho",
  descricao: "Descrição do épico",
  objetivo: null,
  escopo_macro: null,
  resultado_esperado: null,
  status: "rascunho" as const,
  prioridade: "Must" as const,
  missing_fields: ["objetivo", "escopo macro", "resultado esperado"],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockEpicComplete = {
  id: "epic-2",
  projeto_id: "project-1",
  titulo: "Épico Completo",
  descricao: "Descrição completa",
  objetivo: "Objetivo do épico",
  escopo_macro: "Escopo macro",
  resultado_esperado: "Resultado esperado",
  status: "concluido" as const,
  prioridade: "Must" as const,
  missing_fields: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const response = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("renderiza lista vazia de épicos quando não houver registros", async () => {
  vi.stubGlobal("fetch", vi.fn(() => response([])));
  render(<EpicPanel projectId="project-1" canCreate={true} />);

  expect(screen.getByRole("status").textContent).toBe("Carregando épicos do projeto…");
  await screen.findByText("Nenhum épico cadastrado para este projeto ainda.");
});

it("exibe épico em rascunho com aviso de campos obrigatórios pendentes do guia", async () => {
  vi.stubGlobal("fetch", vi.fn(() => response([mockEpicIncomplete])));
  render(<EpicPanel projectId="project-1" canCreate={true} />);

  await screen.findByText("Épico Rascunho");
  expect(screen.getByText("rascunho")).toBeTruthy();
  expect(screen.getByText(/Campos obrigatórios do guia pendentes para conclusão/i)).toBeTruthy();

  // O botão de concluir deve estar desabilitado porque faltam campos obrigatórios
  const concludeBtn = screen.getByRole("button", { name: /Concluir épico/i });
  expect(concludeBtn).toBeDisabled();
});

it("permite salvar novo épico como rascunho", async () => {
  const fetchMock = vi.fn()
    .mockImplementationOnce(() => response([])) // listagem inicial
    .mockImplementationOnce(() => response({ ...mockEpicIncomplete, id: "epic-new", titulo: "Novo Épico Rascunho" })); // criação

  vi.stubGlobal("fetch", fetchMock);
  render(<EpicPanel projectId="project-1" canCreate={true} />);

  await screen.findByText("Nenhum épico cadastrado para este projeto ainda.");

  fireEvent.click(screen.getByText("+ Novo Épico"));
  expect(screen.getByText("Cadastrar Novo Épico (Salvo como Rascunho)")).toBeTruthy();

  fireEvent.change(screen.getByPlaceholderText(/Digitalizar o acompanhamento/i), {
    target: { value: "Novo Épico Rascunho" },
  });
  fireEvent.change(screen.getByPlaceholderText(/O que será construído/i), {
    target: { value: "Descrição inicial para rascunho" },
  });

  fireEvent.click(screen.getByRole("button", { name: /Salvar Épico/i }));

  await screen.findByText("Novo Épico Rascunho");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("permite concluir épico quando todos os campos estiverem preenchidos", async () => {
  const epicReadyToComplete = {
    ...mockEpicComplete,
    id: "epic-ready",
    status: "rascunho" as const,
    missing_fields: [],
  };

  const fetchMock = vi.fn()
    .mockImplementationOnce(() => response([epicReadyToComplete]))
    .mockImplementationOnce(() => response({ ...epicReadyToComplete, status: "concluido" }));

  vi.stubGlobal("fetch", fetchMock);
  render(<EpicPanel projectId="project-1" canCreate={true} />);

  await screen.findByText("Épico Completo");
  const concludeBtn = screen.getByRole("button", { name: /Concluir épico/i });
  expect(concludeBtn).not.toBeDisabled();

  fireEvent.click(concludeBtn);

  await waitFor(() => {
    expect(screen.getByText("concluido")).toBeTruthy();
  });
});

it("oculta botões de criação e conclusão para perfil sem permissão de escrita", async () => {
  vi.stubGlobal("fetch", vi.fn(() => response([mockEpicIncomplete])));
  render(<EpicPanel projectId="project-1" canCreate={false} />);

  await screen.findByText("Épico Rascunho");
  expect(screen.queryByText("+ Novo Épico")).toBeNull();
  expect(screen.queryByRole("button", { name: /Concluir épico/i })).toBeNull();
});
