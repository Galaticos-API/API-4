// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthGate, AuthProvider } from "../auth/Auth";
import { safeDestination } from "../auth/navigation";
import { App } from "../App";

const user = { id: "user-1", nome: "Pessoa PO", email: "po@example.com", role: "po" };
const project = { id: "d4b15820-91c0-4bc2-a2d8-21151c9fa385", nome: "Projeto integrado", cliente: "Cliente", descricao: null, status: "em_andamento" };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); window.localStorage.clear(); });
function mount() { render(<AuthProvider><AuthGate><App /></AuthGate></AuthProvider>); }

it("faz login no destino de projetos, cria e consulta usando o contrato real das APIs", async () => {
  window.history.replaceState(null, "", "/projects/new");
  let authenticated = false;
  const request = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/v1/auth/me") return reply({ user }, authenticated ? 200 : 401);
    if (url === "/api/v1/auth/login") { authenticated = true; return reply({ user }); }
    if (url === "/api/v1/projects" && init?.method === "POST") return reply(project, 201);
    if (url === `/api/v1/projects/${project.id}`) return reply(project);
    if (url.startsWith("http://localhost:")) return reply({});
    throw new Error(`Requisição inesperada: ${url}`);
  });
  vi.stubGlobal("fetch", request);
  mount();
  await screen.findByText("Entrar");
  expect(new URLSearchParams(window.location.search).get("returnTo")).toBe("/projects/new");
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: user.email } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha" } });
  fireEvent.click(screen.getByText("Entrar"));
  await screen.findByLabelText("Nome do projeto");
  expect(screen.getByText(user.nome)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Nome do projeto"), { target: { value: project.nome } });
  fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: project.cliente } });
  fireEvent.click(screen.getByRole("button", { name: "Criar projeto" }));
  expect(await screen.findByText(project.nome)).toBeTruthy();
  expect(window.location.pathname).toBe(`/projects/${project.id}`);
  expect(screen.getByText("em_andamento")).toBeTruthy();
  const post = request.mock.calls.find(([url, init]) => url === "/api/v1/projects" && init?.method === "POST");
  expect(post?.[1]?.credentials).toBe("same-origin");
});

it("retorna ao login quando a API de projetos rejeita a sessão e preserva a rota", async () => {
  window.history.replaceState(null, "", `/projects/${project.id}?tab=contexto#descricao`);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/v1/auth/me" ? reply({ user }) : reply({}, 401)));
  mount();
  expect(await screen.findByText("Sua sessão expirou. Entre novamente para continuar.")).toBeTruthy();
  await waitFor(() => expect(window.location.pathname).toBe("/login"));
  expect(new URLSearchParams(window.location.search).get("returnTo")).toBe(`/projects/${project.id}?tab=contexto#descricao`);
  expect(screen.queryByText("Detalhes do projeto")).toBeNull();
});

it("aceita retorno para projetos e bloqueia caminhos malformados", () => {
  expect(safeDestination(`/projects/${project.id}?tab=1#contexto`)).toBe(`/projects/${project.id}?tab=1#contexto`);
  for (const path of ["/projects//evil.example", "/projects/%2f%2fevil.example", "/projects/../login"]) expect(safeDestination(path)).toBe("/");
});
