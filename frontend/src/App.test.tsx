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

test("renders the landing page view as main default view", () => {
  render(<App />);

  expect(screen.getByText((_, el) => el?.classList?.contains("brand") ?? false)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /Transforme requisitos/i })).toBeInTheDocument();
  expect(screen.getByText("Pilares do Ecossistema")).toBeInTheDocument();
});

test("allows navigating from landing page using action buttons", () => {
  render(<App />);
  const exploreBtn = screen.getByRole("button", { name: "Explorar Projetos" });
  expect(exploreBtn).toBeInTheDocument();
  fireEvent.click(exploreBtn);
});
