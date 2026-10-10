// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthGate } from "./AuthView";
import { AuthProvider, useAuth } from "../../viewmodels/useAuthViewModel";
import { navigate, safeDestination } from "../../models/navigation";
import { apiRequest, readUser } from "../../api/api_auth";
import { useLayoutEffect, useRef } from "react";

const user = { id: "1", nome: "Pessoa", role: "po", email: "pessoa@example.com" };
const reply = (status: number, body: unknown = {}) => Promise.resolve(new Response(JSON.stringify(body), { status }));
function Content() {
  const { logout } = useAuth();
  return <div>Conteúdo interno<button onClick={() => void logout()}>Sair</button>
    <button onClick={() => navigate("/requirements?filter=active#list")}>Requisitos</button>
    <button onClick={() => void apiRequest("/projects").catch(() => { })}>Carregar projetos</button>
  </div>;
}
function mount() { render(<AuthProvider><AuthGate><Content /></AuthGate></AuthProvider>); }
beforeEach(() => {
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});
it("adapta o usuário da S1-01 e rejeita um contrato de sessão inválido", async () => {
  await expect(readUser(new Response(JSON.stringify({ user })))).resolves.toEqual({
    id: user.id, name: user.nome, email: user.email, role: user.role,
  });
  await expect(readUser(new Response(JSON.stringify({ user: { ...user, nome: undefined, name: "Pessoa" } })))).rejects.toThrow("Resposta de sessão inválida");
});

describe("retorno seguro", () => {
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/login", "/logout", "/%2f%2fevil.example", "/unknown", "javascript:alert(1)"])("recusa %s", value => {
    expect(safeDestination(value)).toBe("/");
  });
  it("preserva filtros e fragmento de uma rota interna", () => {
    expect(safeDestination("/requirements?filter=active#list")).toBe("/requirements?filter=active#list");
  });
});

it("não mostra conteúdo enquanto restaura e aceita sessão validada pelo servidor", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  mount();
  expect(screen.queryByText("Conteúdo interno")).toBeNull();
  resolve(new Response(JSON.stringify({ user })));
  expect(await screen.findByText("Conteúdo interno")).toBeTruthy();
});

it("protege acesso direto e retorna ao destino após login", async () => {
  window.history.replaceState(null, "", "/requirements?filter=active#list");
  const fetchMock = vi.fn().mockImplementationOnce(() => reply(401)).mockImplementationOnce(() => reply(200, { user }));
  vi.stubGlobal("fetch", fetchMock);
  mount();
  await screen.findByText("Entre na sua conta");
  expect(screen.queryByText("Conteúdo interno")).toBeNull();
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: user.email } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "secret" } });
  fireEvent.click(screen.getByText("Entrar"));
  await screen.findByText("Conteúdo interno");
  expect(window.location.pathname + window.location.search + window.location.hash).toBe("/requirements?filter=active#list");
  expect(fetchMock.mock.calls[1][1].credentials).toBe("same-origin");
  expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/me");
  expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/auth/login");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: user.email, password: "secret" });
});

it("não revela o campo incorreto e limpa a senha após falha", async () => {
  vi.stubGlobal("fetch", vi.fn(() => reply(401)));
  mount();
  await screen.findByText("Entrar");
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: user.email } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "wrong" } });
  fireEvent.click(screen.getByText("Entrar"));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "E-mail ou senha inválidos.");
  expect((screen.getByLabelText("Senha") as HTMLInputElement).value).toBe("");
});

it("bloqueia o conteúdo se a restauração falhar e permite nova tentativa", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")).mockImplementationOnce(() => reply(200, { user })));
  mount();
  fireEvent.click(await screen.findByText("Tentar novamente"));
  expect(await screen.findByText("Conteúdo interno")).toBeTruthy();
});

it("encerra a sessão e impede reabertura do conteúdo pelo histórico", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => reply(200, { user })).mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 204 }))));
  mount();
  fireEvent.click(await screen.findByText("Sair"));
  await screen.findByText("Entrar");
  window.history.pushState(null, "", "/rag");
  fireEvent.popState(window);
  await waitFor(() => expect(window.location.pathname).toBe("/login"));
  expect(screen.queryByText("Conteúdo interno")).toBeNull();
});

it("não confirma logout quando o servidor falha", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => reply(200, { user })).mockImplementationOnce(() => reply(503)));
  mount();
  fireEvent.click(await screen.findByText("Sair"));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Não foi possível confirmar a saída. Tente encerrar a sessão novamente.");
  expect(screen.queryByText("Conteúdo interno")).toBeNull();
});

it("exige nova autenticação quando uma chamada informa expiração", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => reply(200, { user })).mockImplementationOnce(() => reply(401)));
  mount();
  await screen.findByText("Conteúdo interno");
  fireEvent.click(screen.getByText("Carregar projetos"));
  expect(await screen.findByText("Sua sessão expirou. Entre novamente para continuar.")).toBeTruthy();
  expect(screen.queryByText("Conteúdo interno")).toBeNull();
});

it.each([
  [403, "Acesso indisponível. Entre em contato com o administrador."],
  [429, "Muitas tentativas. Aguarde antes de tentar novamente."],
] as const)("apresenta orientação para resposta %s no login", async (status, message) => {
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => reply(401)).mockImplementationOnce(() => reply(status)));
  mount();
  await screen.findByText("Entrar");
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: user.email } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "secret" } });
  fireEvent.click(screen.getByText("Entrar"));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", message);
  expect(screen.queryByText("Conteúdo interno")).toBeNull();
});

it.each(["focus"])("informa expiração detectada por %s e preserva o destino", async trigger => {
  const fetchMock = vi.fn().mockImplementationOnce(() => reply(200, { user })).mockImplementationOnce(() => reply(401));
  vi.stubGlobal("fetch", fetchMock);
  mount();
  await screen.findByText("Conteúdo interno");
  if (trigger === "focus") fireEvent.focus(window);
  else if (trigger === "navigation") fireEvent.click(screen.getByText("Requisitos"));
  else {
    window.history.replaceState(null, "", "/requirements?filter=active#list");
    fireEvent.popState(window);
  }
  expect(await screen.findByText("Sua sessão expirou. Entre novamente para continuar.")).toBeTruthy();
  expect(screen.queryByText("Conteúdo interno")).toBeNull();
  expect(new URLSearchParams(window.location.search).get("returnTo")).toBe(trigger === "focus" ? "/" : "/requirements?filter=active#list");
  expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/auth/me");
});

it("mantém conteúdo e estado durante a revalidação em segundo plano", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => reply(200, { user }))
    .mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; })));
  mount();
  await screen.findByText("Conteúdo interno");
  const content = screen.getByText("Conteúdo interno");
  fireEvent.focus(window);
  expect(screen.getByText("Conteúdo interno")).toBe(content);
  expect(screen.queryByRole("status")).toBeNull();
  resolve(new Response(JSON.stringify({ user })));
  expect(await screen.findByText("Conteúdo interno")).toBeTruthy();
});

it("não mostra aviso de expiração no primeiro acesso anônimo", async () => {
  vi.stubGlobal("fetch", vi.fn(() => reply(401)));
  mount();
  await screen.findByText("Entrar");
  expect(screen.queryByText("Sua sessão expirou. Entre novamente para continuar.")).toBeNull();
});

it("navegação pelo histórico não dispara nova verificação de sessão", async () => {
  const fetchMock = vi.fn().mockImplementationOnce(() => reply(200, { user })).mockImplementationOnce(() => reply(401));
  vi.stubGlobal("fetch", fetchMock);
  function ImmediateNavigation() {
    const sent = useRef(false);
    useLayoutEffect(() => {
      if (sent.current) return;
      sent.current = true;
      window.history.replaceState(null, "", "/requirements?filter=active#list");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, []);
    return <Content />;
  }
  render(<AuthProvider><AuthGate><ImmediateNavigation /></AuthGate></AuthProvider>);
  expect(await screen.findByText("Conteúdo interno")).toBeTruthy();
  fireEvent.click(screen.getByText("Requisitos"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("status")).toBeNull();
});


it("cadastro público envia apenas perfil dev", async () => {
  window.history.replaceState(null, "", "/register");
  const fetchMock = vi.fn().mockImplementationOnce(() => reply(401)).mockImplementation(() => reply(200, {user: {...user, role: "dev"}}));
  vi.stubGlobal("fetch", fetchMock);
  mount();
  await screen.findByText("Criar nova conta");
  expect(screen.queryByRole("combobox")).toBeNull();
  fireEvent.change(screen.getByLabelText("Nome Completo"), {target: {value: "Pessoa"}});
  fireEvent.change(screen.getByLabelText("E-mail Corporativo"), {target: {value: "pessoa@example.com"}});
  fireEvent.change(screen.getByLabelText("Senha (mínimo 6 caracteres)"), {target: {value: "Senha123!"}});
  fireEvent.change(screen.getByLabelText("Confirmar Senha"), {target: {value: "Senha123!"}});
  fireEvent.click(screen.getByText("Cadastrar e Entrar"));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/v1/auth/register" && JSON.parse(init.body).role === "dev")).toBe(true));
});


it("cache não autentica antes da resposta inicial e falha de rede bloqueia a abertura", async () => {
  localStorage.setItem("app_auth_user",JSON.stringify(user));
  let reject!: (reason: Error) => void;
  vi.stubGlobal("fetch",vi.fn(()=>new Promise<Response>((_resolve,fail)=>{reject=fail})));
  mount();
  expect(screen.queryByText("Conteúdo interno")).toBeNull();
  expect(screen.getByRole("status")).toHaveProperty("textContent","Verificando sessão…");
  reject(new Error("offline"));
  expect(await screen.findByText("Não foi possível verificar a sessão")).toBeTruthy();
  expect(screen.queryByText("Conteúdo interno")).toBeNull();
});
