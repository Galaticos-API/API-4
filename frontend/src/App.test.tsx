import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";

vi.mock("./auth/Auth", () => ({
  useAuth: () => ({
    session: { status: "authenticated", user: { id: "test-user", name: "Test User" } },
    logout: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("services unavailable in unit test"))));
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

test("renders the architecture view and service catalog", () => {
  render(<App />);

  expect(screen.getByRole("heading", { name: "Sinapse" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Topologia de Serviços e Microsserviços" })).toBeInTheDocument();
  expect(screen.getByText("PostgreSQL + pgvector")).toBeInTheDocument();
});

test("allows switching to the requirements view", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /Requisitos do PO/ }));

  expect(screen.getByRole("heading", { name: "Modelo de Requisitos & Proveniência" })).toBeInTheDocument();
});
