import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TeamExperienceSearch } from "./TeamExperienceSearch";
import { whoWorkedWith } from "../../api/api_team";

vi.mock("../../api/api_team", () => ({ whoWorkedWith: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("lista profissionais com competências e projetos que fundamentam o resultado", async () => {
  vi.mocked(whoWorkedWith).mockResolvedValue({
    resposta: "ok", encontrado: true, tecnologias: [{ id: "t", nome: "PIX" }],
    profissionais: [{
      desenvolvedor_id: "d1", nome: "Bruno", senioridade: "Senior",
      competencias: [{ tecnologia_id: "t", tecnologia_nome: "PIX", nivel: "avancado", evidencia: "Checkout PIX" }],
      projetos: [{ projeto_id: "p1", projeto_nome: "Atlas", papeis: ["Backend"], em_andamento: true, tecnologias: [{ id: "t", nome: "PIX" }] }],
    }],
  });
  render(<TeamExperienceSearch />);
  fireEvent.change(screen.getByLabelText("Quem já trabalhou com…"), { target: { value: "integração PIX" } });
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  const region = await screen.findByRole("region", { name: "Profissionais encontrados" });
  expect(region.textContent).toContain("Bruno (Senior)");
  expect(region.textContent).toContain("Competência avançado em PIX: Checkout PIX");
  expect(region.textContent).toContain("Atuou em Atlas como Backend (em andamento)");
  expect(whoWorkedWith).toHaveBeenCalledWith("integração PIX", expect.any(AbortSignal));
});

it("informa a ausência de registro sem listar ninguém", async () => {
  vi.mocked(whoWorkedWith).mockResolvedValue({
    resposta: "Não há registro de experiência com Kotlin na equipe.", encontrado: false, tecnologias: [], profissionais: [],
  });
  render(<TeamExperienceSearch />);
  fireEvent.change(screen.getByLabelText("Quem já trabalhou com…"), { target: { value: "Kotlin" } });
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect((await screen.findByRole("status")).textContent).toContain("Não há registro de experiência com Kotlin");
  expect(screen.queryByRole("region", { name: "Profissionais encontrados" })).toBeNull();
});
