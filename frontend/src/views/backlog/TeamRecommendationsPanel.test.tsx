import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TeamRecommendationsPanel } from "./TeamRecommendationsPanel";
import { recommendForFeature } from "../../api/api_team";

vi.mock("../../api/api_team", () => ({ recommendForFeature: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const advisory = "Recomendação consultiva: nenhuma alocação é feita automaticamente. A decisão sobre o squad é do gestor.";

it("só calcula quando solicitado e mostra sugestões com justificativa, sem alocar", async () => {
  vi.mocked(recommendForFeature).mockResolvedValue({
    base_suficiente: true, mensagem: "1 profissional", aviso: advisory, criterio: "Aderência = parcela das tecnologias.",
    tecnologias: [{ id: "t", nome: "PIX" }],
    recomendacoes: [{
      desenvolvedor_id: "d1", nome: "Ana", senioridade: "Senior", aderencia: 100, ja_alocado_no_projeto: true,
      tecnologias: [], justificativa: "PIX: competência especialista (evidência: Checkout PIX).",
    }],
  });
  render(<TeamRecommendationsPanel featureId="f1" />);
  expect(recommendForFeature).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Recomendar profissionais" }));
  const list = await screen.findByRole("list", { name: "Profissionais sugeridos" });
  expect(list.textContent).toContain("Sugestão · aderência 100%");
  expect(list.textContent).toContain("Já alocado no projeto");
  expect(list.textContent).toContain("competência especialista (evidência: Checkout PIX)");
  expect(screen.getByRole("note").textContent).toContain("nenhuma alocação é feita automaticamente");
  expect(screen.queryByRole("button", { name: /alocar/i })).toBeNull();
});

it("sinaliza base insuficiente", async () => {
  vi.mocked(recommendForFeature).mockResolvedValue({
    base_suficiente: false, mensagem: "A feature não possui tecnologias associadas, então não há base suficiente para recomendar profissionais.",
    aviso: advisory, criterio: "", tecnologias: [], recomendacoes: [],
  });
  render(<TeamRecommendationsPanel featureId="f1" />);
  fireEvent.click(screen.getByRole("button", { name: "Recomendar profissionais" }));
  expect((await screen.findByRole("status")).textContent).toContain("não há base suficiente");
  expect(screen.queryByRole("list", { name: "Profissionais sugeridos" })).toBeNull();
});
