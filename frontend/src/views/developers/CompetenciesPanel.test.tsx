import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CompetenciesPanel } from "./CompetenciesPanel";
import { createCompetency, type DeveloperCompetency } from "../../api/api_developers";
import { createTechnology, listVocabulary, type Technology } from "../../api/api_technologies";

vi.mock("../../api/api_developers", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/api_developers")>();
  return { ...original, createCompetency: vi.fn(), updateCompetency: vi.fn(), removeCompetency: vi.fn() };
});
vi.mock("../../api/api_technologies", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/api_technologies")>();
  return { ...original, listVocabulary: vi.fn(), createTechnology: vi.fn() };
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const usage = { competencias: 0, itens: 0, total: 0 };
const vocabulary: Technology[] = [
  { id: "t-node", nome: "Node.js", categoria: "backend", uso: usage },
  { id: "t-ts", nome: "TypeScript", categoria: "backend", uso: usage },
];
const existing: DeveloperCompetency = {
  id: "c1", desenvolvedor_id: "d1", tecnologia_id: "t-ts", nivel: "avancado",
  evidencia: "Projeto Atlas", tecnologia_nome: "TypeScript",
};

it("dev apenas visualiza competências com nível e evidência", () => {
  render(<CompetenciesPanel developerId="d1" competencias={[existing]} canManage={false} onChanged={() => undefined} />);
  expect(screen.getByText("Avançado")).toBeTruthy();
  expect(screen.getByText("Evidência: Projeto Atlas")).toBeTruthy();
  expect(screen.queryByRole("form", { name: "Registrar competência" })).toBeNull();
  expect(listVocabulary).not.toHaveBeenCalled();
});

it("registra competência escolhendo a tecnologia do vocabulário", async () => {
  vi.mocked(listVocabulary).mockResolvedValue(vocabulary);
  vi.mocked(createCompetency).mockResolvedValue({ ...existing, id: "c2", tecnologia_id: "t-node", tecnologia_nome: "Node.js" });
  const onChanged = vi.fn();
  render(<CompetenciesPanel developerId="d1" competencias={[existing]} canManage onChanged={onChanged} />);
  await waitFor(() => expect(listVocabulary).toHaveBeenCalled());

  fireEvent.change(screen.getByLabelText("Tecnologia (do vocabulário)"), { target: { value: "nodejs" } });
  const suggestions = await screen.findByRole("list", { name: "Tecnologias sugeridas" });
  expect(suggestions.textContent).toContain("Node.js");
  expect(suggestions.textContent).not.toContain("TypeScript");
  fireEvent.click(screen.getByRole("button", { name: "Node.js" }));

  fireEvent.change(screen.getByLabelText("Nível"), { target: { value: "especialista" } });
  fireEvent.change(screen.getByLabelText("Evidência"), { target: { value: "Liderou a migração do backend." } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar competência" }));

  await screen.findByText("Competência registrada no perfil.");
  expect(createCompetency).toHaveBeenCalledWith("d1", { tecnologia_id: "t-node", nivel: "especialista", evidencia: "Liderou a migração do backend." });
  expect(onChanged).toHaveBeenCalled();
});

it("oferece incluir no vocabulário a tecnologia inexistente e a seleciona", async () => {
  vi.mocked(listVocabulary).mockResolvedValue(vocabulary);
  vi.mocked(createTechnology).mockResolvedValue({ id: "t-kotlin", nome: "Kotlin", categoria: "mobile", uso: usage });
  render(<CompetenciesPanel developerId="d1" competencias={[]} canManage onChanged={() => undefined} />);
  await waitFor(() => expect(listVocabulary).toHaveBeenCalled());

  fireEvent.change(screen.getByLabelText("Tecnologia (do vocabulário)"), { target: { value: "Kotlin" } });
  expect(await screen.findByText(/não existe no vocabulário/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "mobile" } });
  fireEvent.click(screen.getByRole("button", { name: "Incluir no vocabulário" }));

  await screen.findByText(/incluída no vocabulário/);
  expect(createTechnology).toHaveBeenCalledWith({ nome: "Kotlin", categoria: "mobile" });
  expect(screen.queryByText(/não existe no vocabulário/)).toBeNull();
});
