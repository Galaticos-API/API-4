// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Projects } from "./Projects";
import { isProjectPath } from "./navigation";

const project = { id: "project-1", nome: "Sinapse", cliente: "Cliente", descricao: "Conhecimento da equipe", status: "ativo" };
const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });
function form() { render(<Projects pathname="/projects/new" />); }
function fill() {
  fireEvent.change(screen.getByLabelText("Nome do projeto"), { target: { value: " Sinapse " } });
  fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Cliente" } });
  fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Conhecimento da equipe" } });
}

it("mostra carregamento e estado vazio com ação de criação", async () => {
  vi.stubGlobal("fetch", vi.fn(() => response({ projects: [] })));
  render(<Projects pathname="/projects" />);
  expect(screen.getByRole("status").textContent).toBe("Carregando projetos…");
  await screen.findByText("Nenhum projeto cadastrado");
  fireEvent.click(screen.getByText("Criar primeiro projeto"));
  expect(window.location.pathname).toBe("/projects/new");
});

it("lista projetos e permite abrir detalhe", async () => {
  vi.stubGlobal("fetch", vi.fn(() => response({ projects: [project] })));
  render(<Projects pathname="/projects" />);
  fireEvent.click(await screen.findByLabelText("Abrir projeto Sinapse"));
  expect(window.location.pathname).toBe("/projects/project-1");
});

it("permite recuperar a lista após erro", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => response({}, 503)).mockImplementationOnce(() => response({ projects: [project] })));
  render(<Projects pathname="/projects" />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByText("Tentar novamente"));
  expect(await screen.findByText("Sinapse")).toBeTruthy();
});

it("impede envio sem nome e indica o campo obrigatório", () => {
  const request = vi.fn(); vi.stubGlobal("fetch", request);
  form();
  fireEvent.change(screen.getByLabelText("Nome do projeto"), { target: { value: "   " } });
  fireEvent.click(screen.getByText("Criar projeto", { selector: "button" }));
  expect(screen.getByText("Informe o nome do projeto.")).toBeTruthy();
  expect(screen.getByLabelText("Nome do projeto").getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(screen.getByLabelText("Nome do projeto"));
  expect(request).not.toHaveBeenCalled();
});

it("indica dados válidos, impede envio duplicado e abre detalhe após salvar", async () => {
  let resolve!: (value: Response) => void;
  const request = vi.fn<typeof fetch>(() => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal("fetch", request);
  form(); fill();
  expect(screen.getByRole("status").textContent).toBe("Dados preenchidos. Pronto para criar.");
  fireEvent.click(screen.getByText("Criar projeto", { selector: "button" }));
  fireEvent.submit(screen.getByLabelText("Nome do projeto").closest("form")!);
  expect(request).toHaveBeenCalledTimes(1);
  expect((screen.getByText("Criando…") as HTMLButtonElement).disabled).toBe(true);
  expect(JSON.parse(request.mock.calls[0][1]?.body as string)).toEqual({ nome: "Sinapse", cliente: "Cliente", descricao: "Conhecimento da equipe" });
  resolve(new Response(JSON.stringify({ project })));
  await waitFor(() => expect(window.location.pathname).toBe("/projects/project-1"));
});

it("informa nome duplicado e mantém os dados para correção", async () => {
  vi.stubGlobal("fetch", vi.fn(() => response({}, 409)));
  form(); fill();
  fireEvent.click(screen.getByText("Criar projeto", { selector: "button" }));
  await screen.findByText("Este nome já está em uso por um projeto ativo.");
  expect((screen.getByLabelText("Cliente") as HTMLInputElement).value).toBe("Cliente");
  fireEvent.change(screen.getByLabelText("Nome do projeto"), { target: { value: "Outro projeto" } });
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each([403, 422, 503])("trata erro %s ao criar sem apagar os campos", async status => {
  vi.stubGlobal("fetch", vi.fn(() => response({}, status)));
  form(); fill();
  fireEvent.click(screen.getByText("Criar projeto", { selector: "button" }));
  await screen.findByRole("alert");
  expect((screen.getByLabelText("Nome do projeto") as HTMLInputElement).value).toBe(" Sinapse ");
  expect((screen.getByText("Criar projeto", { selector: "button" }) as HTMLButtonElement).disabled).toBe(false);
});

it("apresenta os dados e status no detalhe", async () => {
  vi.stubGlobal("fetch", vi.fn(() => response({ project })));
  render(<Projects pathname="/projects/project-1" />);
  expect(await screen.findByText("Sinapse")).toBeTruthy();
  expect(screen.getByText("ativo")).toBeTruthy();
  expect(screen.getByText("Conhecimento da equipe")).toBeTruthy();
});

it("trata projeto inexistente", async () => {
  vi.stubGlobal("fetch", vi.fn(() => response({}, 404)));
  render(<Projects pathname="/projects/missing" />);
  expect(await screen.findByText("Projeto não encontrado.")).toBeTruthy();
});

it("reconhece as rotas de projetos e rejeita caminhos não suportados", () => {
  expect(isProjectPath("/projects/project-1")).toBe(true);
  expect(isProjectPath("/projects/new")).toBe(true);
  expect(isProjectPath("/projects//evil.example")).toBe(false);
});
