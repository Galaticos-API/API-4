import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";

const { mockUser } = vi.hoisted(() => ({
  mockUser: { id: "test-user", name: "Test User", role: "po" as "admin" | "po" | "dev" },
}));

vi.mock("./auth/Auth", () => ({
  useAuth: () => ({
    session: { status: "authenticated", user: mockUser },
    logout: vi.fn(),
  }),
}));

beforeEach(() => {
  mockUser.role = "po";
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("services unavailable in unit test"))));
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

test("renders the landing page view as main default view", () => {
  render(<App />);

  expect(screen.getByText((_, el) => el?.classList?.contains("brand") ?? false)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Transforme requisitos/i })).toBeInTheDocument();
  expect(screen.getByText("Pilares do Ecossistema")).toBeInTheDocument();
});

test("brand is a keyboard-accessible link to projects", () => {
  render(<App />);
  const brand = screen.getByRole("link", { name: /NAPSE/i });
  expect(brand).toHaveAttribute("href", "/projects");
  fireEvent.click(brand);
  expect(window.location.pathname).toBe("/projects");
});

test("shows administration navigation only to admins", () => {
  const { rerender } = render(<App />);
  expect(screen.queryByRole("button", { name: "Abrir administração" })).not.toBeInTheDocument();

  mockUser.role = "admin";
  rerender(<App />);
  expect(screen.getByRole("button", { name: "Abrir administração" })).toBeInTheDocument();
});

test("blocks direct navigation to administration for non-admin users", () => {
  window.history.replaceState(null, "", "/admin");
  const fetchMock = vi.mocked(fetch);
  render(<App />);

  expect(screen.getByRole("heading", { name: "Acesso restrito" })).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalledWith("/api/v1/admin/stats", expect.anything());
  fireEvent.click(screen.getByRole("button", { name: "Voltar para projetos" }));
  expect(window.location.pathname).toBe("/projects");
});

test("allows navigating from landing page using action buttons", () => {
  render(<App />);
  const exploreBtn = screen.getByRole("button", { name: "Explorar Projetos" });
  expect(exploreBtn).toBeInTheDocument();
  fireEvent.click(exploreBtn);
});
