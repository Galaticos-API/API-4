import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AllocationsPanel, periodError } from "./AllocationsPanel";
import { createAllocation, updateAllocation, type DeveloperAllocation } from "../../api/api_developers";
import { listProjects } from "../../api/api_projects";
import { allocationDay } from "../../models/allocations";

vi.mock("../../api/api_developers", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/api_developers")>();
  return { ...original, createAllocation: vi.fn(), updateAllocation: vi.fn(), removeAllocation: vi.fn() };
});
vi.mock("../../api/api_projects", () => ({ listProjects: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const allocation: DeveloperAllocation = {
  id: "a1", desenvolvedor_id: "d1", projeto_id: "p1", projeto_nome: "Atlas", projeto_status: "ativo",
  papel: "Backend", data_inicio: "2026-01-05T03:00:00.000Z", data_fim: null, em_andamento: true,
};

function mockProjects() {
  vi.mocked(listProjects).mockResolvedValue({
    projects: [
      { id: "p1", nome: "Atlas", cliente: "X", descricao: "", status: "ativo" },
      { id: "p2", nome: "Boreal", cliente: "X", descricao: "", status: "em_andamento" },
      { id: "p3", nome: "Antigo", cliente: "X", descricao: "", status: "arquivado" },
    ],
    total: 3, limit: 50, offset: 0,
  });
}

it("converte datas gravadas para o dia de São Paulo e valida o período", () => {
  expect(allocationDay("2026-01-05T03:00:00.000Z")).toBe("2026-01-05");
  expect(allocationDay("2026-06-30T23:59:59.999-03:00")).toBe("2026-06-30");
  expect(periodError({ data_inicio: "2026-06-01", data_fim: "2026-05-31" })).toMatch(/anterior/);
  expect(periodError({ data_inicio: "2026-06-01", data_fim: "" })).toBe("");
});

it("dev vê alocações sem formulário", () => {
  render(<AllocationsPanel developerId="d1" alocacoes={[allocation]} canManage={false} onChanged={() => undefined} />);
  expect(screen.getByText("Em andamento", { selector: "span" })).toBeTruthy();
  expect(screen.queryByRole("form", { name: "Registrar alocação" })).toBeNull();
  expect(listProjects).not.toHaveBeenCalled();
});

it("registra alocação em andamento só com projetos não arquivados", async () => {
  mockProjects();
  vi.mocked(createAllocation).mockResolvedValue(allocation);
  const onChanged = vi.fn();
  render(<AllocationsPanel developerId="d1" alocacoes={[]} canManage onChanged={onChanged} />);
  await waitFor(() => expect(screen.getByRole("option", { name: "Boreal" })).toBeTruthy());
  expect(screen.queryByRole("option", { name: "Antigo" })).toBeNull();

  fireEvent.change(screen.getByLabelText("Projeto"), { target: { value: "p2" } });
  fireEvent.change(screen.getByLabelText("Papel"), { target: { value: " Tech Lead " } });
  fireEvent.change(screen.getByLabelText("Início"), { target: { value: "2026-03-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar alocação" }));

  await screen.findByText(/histórico consolidado já reflete/);
  expect(createAllocation).toHaveBeenCalledWith("d1", { projeto_id: "p2", papel: "Tech Lead", data_inicio: "2026-03-01", data_fim: null });
  expect(onChanged).toHaveBeenCalled();
});

it("bloqueia término anterior ao início e indica a inconsistência", async () => {
  mockProjects();
  render(<AllocationsPanel developerId="d1" alocacoes={[]} canManage onChanged={() => undefined} />);
  await waitFor(() => expect(screen.getByRole("option", { name: "Atlas" })).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Projeto"), { target: { value: "p1" } });
  fireEvent.change(screen.getByLabelText("Papel"), { target: { value: "QA" } });
  fireEvent.change(screen.getByLabelText("Início"), { target: { value: "2026-06-01" } });
  fireEvent.change(screen.getByLabelText("Término (deixe vazio se em andamento)"), { target: { value: "2026-05-01" } });
  expect(screen.getByRole("alert").textContent).toMatch(/anterior à data de início/);
  expect((screen.getByRole("button", { name: "Registrar alocação" }) as HTMLButtonElement).disabled).toBe(true);
});

it("encerra uma alocação existente pela edição", async () => {
  mockProjects();
  vi.mocked(updateAllocation).mockResolvedValue({ ...allocation, data_fim: "2026-09-30T23:59:59.999-03:00", em_andamento: false });
  render(<AllocationsPanel developerId="d1" alocacoes={[allocation]} canManage onChanged={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: "Editar alocação em Atlas" }));
  const form = within(screen.getByRole("form", { name: "Editar alocação em Atlas" }));
  expect((form.getByLabelText("Início") as HTMLInputElement).value).toBe("2026-01-05");
  fireEvent.change(form.getByLabelText("Término (deixe vazio se em andamento)"), { target: { value: "2026-09-30" } });
  fireEvent.click(form.getByRole("button", { name: "Salvar" }));
  await screen.findByText("Alocação atualizada.");
  expect(updateAllocation).toHaveBeenCalledWith("d1", "a1", { papel: "Backend", data_inicio: "2026-01-05", data_fim: "2026-09-30" });
});
