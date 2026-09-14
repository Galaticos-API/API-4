// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AISuggestion, Button, Field, Progress } from "./index";

afterEach(cleanup);

it("botão desabilitado não executa a ação", () => {
  const action = vi.fn();
  render(<Button disabled onClick={action}>Salvar</Button>);
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  expect(action).not.toHaveBeenCalled();
});

it("campo apresenta erro com alerta e mantém rótulo acessível", () => {
  render(<Field label="Nome" error="Nome obrigatório"><input /></Field>);
  expect(screen.getByLabelText(/Nome/)).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toBe("Nome obrigatório");
});

it.each([[-20, 0], [45, 45], [150, 100]])("progresso %s fica no intervalo acessível", (value, expected) => {
  render(<Progress value={value} label="Completude" />);
  expect(screen.getByRole("progressbar", { name: "Completude" }).getAttribute("aria-valuenow")).toBe(String(expected));
});

it("sugestão de IA exige ação explícita e diferencia aceitar, editar e descartar", () => {
  const accept = vi.fn(); const edit = vi.fn(); const discard = vi.fn();
  render(<AISuggestion onAccept={accept} onEdit={edit} onDiscard={discard}>Sugestão de requisito</AISuggestion>);
  expect(accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Editar antes de aceitar" }));
  expect(edit).toHaveBeenCalledTimes(1);
  expect(accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
  expect(discard).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
  expect(accept).toHaveBeenCalledTimes(1);
});
