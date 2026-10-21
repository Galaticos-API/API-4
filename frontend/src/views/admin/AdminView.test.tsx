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
  await screen.findAllByRole("option", { name: project.nome });
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
  await screen.findAllByRole("option", { name: project.nome });
  fireEvent.change(screen.getByLabelText("Projeto de destino"), { target: { value: project.id } });
  fireEvent.click(screen.getByRole("button", { name: "Carregar demonstração" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Projeto arquivado é somente leitura.");
});

it("exige confirmação exata do nome do projeto para habilitar botão de expurgo e envia requisição transacional", async () => {
  let purged = false;
  const request = vi.fn((url: string, init?: RequestInit) => {
    if (url.includes("/projects?")) {
      return json({ items: [project], total: 1, limit: 50, offset: 0 });
    }
    if (url.includes(`/admin/projects/${project.id}/purge`)) {
      expect(init!.method).toBe("POST");
      const body = JSON.parse(init!.body as string);
      expect(body.confirmacao_nome).toBe(project.nome);
      expect(body.justificativa).toBe("Limpeza solicitada");
      purged = true;
      return json({
        chunks_removidos: 15,
        eventos_removidos: 3,
        documentos_afetados: 2,
        projeto_id: project.id,
        nome: project.nome,
        expurgado_em: "2026-10-21T10:00:00.000Z",
      });
    }
    return json({ projetos: 1, epicos: 0, features: 0, pbis: 0, documentos: 0, chunksIndexados: 15, statusSistema: "operacional" });
  });
  vi.stubGlobal("fetch", request);

  render(<AdminView />);
  await screen.findAllByRole("option", { name: project.nome });

  const purgeBtn = screen.getByRole("button", { name: "Expurgar contexto do projeto" });
  expect(purgeBtn).toBeDisabled();

  // Seleciona o projeto a expurgar
  fireEvent.change(screen.getByLabelText("Projeto para expurgo"), { target: { value: project.id } });
  expect(purgeBtn).toBeDisabled();

  // Digita nome incorreto
  const confirmInput = screen.getByLabelText(/Digite exatamente o nome do projeto/);
  fireEvent.change(confirmInput, { target: { value: "Nome Errado" } });
  expect(purgeBtn).toBeDisabled();

  // Digita nome correto
  fireEvent.change(confirmInput, { target: { value: project.nome } });
  expect(purgeBtn).toBeEnabled();

  // Preenche justificativa
  fireEvent.change(screen.getByLabelText("Justificativa (opcional):"), { target: { value: "Limpeza solicitada" } });

  // Executa o expurgo
  fireEvent.click(purgeBtn);

  expect(
    await screen.findByText(/Contexto indexado de "Projeto escolhido" expurgado com sucesso/i)
  ).toBeInTheDocument();
  expect(purged).toBe(true);
});

it("exibe mensagem de erro quando o expurgo do projeto falha", async () => {
  const request = vi.fn((url: string) => {
    if (url.includes("/projects?")) {
      return json({ items: [project], total: 1, limit: 50, offset: 0 });
    }
    if (url.includes(`/admin/projects/${project.id}/purge`)) {
      return json({ error: "Nome de confirmação não confere com o projeto." }, 400);
    }
    return json({ projetos: 1, epicos: 0, features: 0, pbis: 0, documentos: 0, chunksIndexados: 0, statusSistema: "operacional" });
  });
  vi.stubGlobal("fetch", request);

  render(<AdminView />);
  await screen.findAllByRole("option", { name: project.nome });

  fireEvent.change(screen.getByLabelText("Projeto para expurgo"), { target: { value: project.id } });
  const confirmInput = screen.getByLabelText(/Digite exatamente o nome do projeto/);
  fireEvent.change(confirmInput, { target: { value: project.nome } });

  const purgeBtn = screen.getByRole("button", { name: "Expurgar contexto do projeto" });
  fireEvent.click(purgeBtn);

  expect(await screen.findByRole("alert")).toHaveTextContent("Nome de confirmação não confere com o projeto.");
});


