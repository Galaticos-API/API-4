// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ItemArchive } from "./ItemArchive";


const project = { id: "project-1", titulo: "Sinapse", cliente: "Cliente", descricao: "Contexto", status: "ativo" as const };
const impact = { epicos: 2, features: 3, pbis: 5 };
const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("consulta o impacto e cancelar não envia arquivamento", async () => {
  const fetcher = vi.fn(() => reply(impact)); vi.stubGlobal("fetch", fetcher);
  render(<ItemArchive kind="features" project={project} canWrite onArchived={vi.fn()} />);
  fireEvent.click(screen.getByText("Arquivar item"));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("2 épico(s), 3 feature(s) e 5 PBI(s)");
  fireEvent.click(screen.getByText("Cancelar"));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("envia a confirmação e a prévia exibida, sem duplicar a gravação", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => reply(impact)).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher); const saved = vi.fn();
  render(<ItemArchive kind="features" project={project} canWrite onArchived={saved} />);
  fireEvent.click(screen.getByText("Arquivar item")); await screen.findByRole("dialog");
  fireEvent.click(screen.getByText("Confirmar arquivamento")); fireEvent.click(screen.getByText("Confirmar arquivamento"));
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ confirmado: true, impacto: impact });
  finish(new Response(JSON.stringify({ ...project, status: "arquivado", archived_at: "2026-09-16T12:00:00Z" })));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
});

it("impacto alterado exige uma nova prévia", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => reply(impact)).mockImplementationOnce(() => reply({ error: "Mudou" }, 409)));
  render(<ItemArchive kind="features" project={project} canWrite onArchived={vi.fn()} />);
  fireEvent.click(screen.getByText("Arquivar item")); await screen.findByRole("dialog"); fireEvent.click(screen.getByText("Confirmar arquivamento"));
  expect((await screen.findByRole("alert")).textContent).toContain("Consulte a prévia novamente");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("falha da prévia não permite confirmar", async () => {
  vi.stubGlobal("fetch", vi.fn(() => reply({}, 500)));
  render(<ItemArchive kind="features" project={project} canWrite onArchived={vi.fn()} />);
  fireEvent.click(screen.getByText("Arquivar item")); await screen.findByRole("alert");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("perfil de leitura e projeto arquivado não oferecem ação", () => {
  const view = render(<ItemArchive kind="features" project={project} canWrite={false} onArchived={vi.fn()} />);
  expect(screen.queryByRole("button")).toBeNull();
  view.rerender(<ItemArchive kind="features" project={{ ...project, status: "arquivado" }} canWrite onArchived={vi.fn()} />);
  expect(screen.queryByRole("button")).toBeNull();
});

