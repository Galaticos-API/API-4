import { describe, it, expect, beforeEach, vi } from "vitest";
import { QualityService } from "./quality.service.js";
import { PbisRepository } from "../pbis/pbis.repository.js";
import { CriteriaRepository } from "../criteria/criteria.repository.js";
import { NotFoundError } from "../../shared/errors.js";

describe("QualityService", () => {
  let qualityService: QualityService;
  let mockPbisRepo: PbisRepository;
  let mockCriteriaRepo: CriteriaRepository;

  beforeEach(() => {
    mockPbisRepo = {
      findById: vi.fn(),
    } as unknown as PbisRepository;

    mockCriteriaRepo = {
      listByEntity: vi.fn(),
    } as unknown as CriteriaRepository;

    qualityService = new QualityService(mockPbisRepo, mockCriteriaRepo);
  });

  describe("validatePbi", () => {
    it("should throw NotFoundError when PBI does not exist", async () => {
      (mockPbisRepo.findById as any).mockResolvedValue(null);

      await expect(qualityService.validatePbi("non-existent-id")).rejects.toThrow(NotFoundError);
    });

    it("should return quality report with completeness score", async () => {
      const mockPbi = {
        id: "pbi-1",
        titulo: "Criar usuário",
        historia_como_um: "Como um administrador",
        historia_eu_quero: "eu quero criar um usuário",
        historia_para_que: "para que possa acessar o sistema",
        regras_observacoes: null,
      };

      (mockPbisRepo.findById as any).mockResolvedValue(mockPbi);
      (mockCriteriaRepo.listByEntity as any).mockResolvedValue([
        {
          id: "c1",
          dado: "Dado que sou administrador",
          quando: "Quando acesso a tela de usuários",
          entao: "Então vejo o botão criar",
        },
      ]);

      const result = await qualityService.validatePbi("pbi-1");

      expect(result.entity_type).toBe("pbi");
      expect(result.entity_id).toBe("pbi-1");
      expect(result.checks).toHaveLength(4);
      expect(result.score_completude).toBeGreaterThan(0);
    });

    it("should calculate 100% completeness when all checks pass", async () => {
      const mockPbi = {
        id: "pbi-1",
        titulo: "Criar usuário",
        historia_como_um: "Como um administrador",
        historia_eu_quero: "eu quero criar um usuário",
        historia_para_que: "para que possa acessar o sistema",
        regras_observacoes: "O sistema deve validar os campos obrigatórios",
      };

      (mockPbisRepo.findById as any).mockResolvedValue(mockPbi);
      (mockCriteriaRepo.listByEntity as any).mockResolvedValue([
        {
          id: "c1",
          dado: "Dado que sou administrador",
          quando: "Quando acesso a tela de usuários",
          entao: "Então vejo o botão criar",
        },
      ]);

      const result = await qualityService.validatePbi("pbi-1");

      expect(result.score_completude).toBe(100);
    });

    it("should identify missing user story blocks", async () => {
      const mockPbi = {
        id: "pbi-1",
        titulo: "Criar usuário",
        historia_como_um: "Como um administrador",
        historia_eu_quero: "",
        historia_para_que: "para que possa acessar o sistema",
        regras_observacoes: null,
      };

      (mockPbisRepo.findById as any).mockResolvedValue(mockPbi);
      (mockCriteriaRepo.listByEntity as any).mockResolvedValue([]);

      const result = await qualityService.validatePbi("pbi-1");

      const historyCheck = result.checks.find(c => c.check_id === "historia_completa");
      expect(historyCheck?.passed).toBe(false);
      expect(historyCheck?.message).toContain("EU QUERO");
    });

    it("should identify incomplete scenarios", async () => {
      const mockPbi = {
        id: "pbi-1",
        titulo: "Criar usuário",
        historia_como_um: "Como um administrador",
        historia_eu_quero: "eu quero criar um usuário",
        historia_para_que: "para que possa acessar o sistema",
        regras_observacoes: null,
      };

      (mockPbisRepo.findById as any).mockResolvedValue(mockPbi);
      (mockCriteriaRepo.listByEntity as any).mockResolvedValue([
        {
          id: "c1",
          dado: "Dado que sou administrador",
          quando: "",
          entao: "Então vejo o botão criar",
        },
      ]);

      const result = await qualityService.validatePbi("pbi-1");

      const scenarioCheck = result.checks.find(c => c.check_id === "cenario_estruturado");
      expect(scenarioCheck?.passed).toBe(false);
      expect(scenarioCheck?.message).toContain("incompletos");
    });

    it("should identify vague terms", async () => {
      const mockPbi = {
        id: "pbi-1",
        titulo: "Criar usuário rápido",
        historia_como_um: "Como um administrador",
        historia_eu_quero: "eu quero criar um usuário",
        historia_para_que: "para que o sistema seja eficiente",
        regras_observacoes: "A interface deve ser intuitiva",
      };

      (mockPbisRepo.findById as any).mockResolvedValue(mockPbi);
      (mockCriteriaRepo.listByEntity as any).mockResolvedValue([]);

      const result = await qualityService.validatePbi("pbi-1");

      const vagueCheck = result.checks.find(c => c.check_id === "termos_vagos");
      expect(vagueCheck?.passed).toBe(false);
      expect(vagueCheck?.message).toContain("termos vagos");
    });

    it("should validate title starts with verb in infinitive", async () => {
      const mockPbi = {
        id: "pbi-1",
        titulo: "Tela de usuários",
        historia_como_um: "Como um administrador",
        historia_eu_quero: "eu quero criar um usuário",
        historia_para_que: "para que possa acessar o sistema",
        regras_observacoes: null,
      };

      (mockPbisRepo.findById as any).mockResolvedValue(mockPbi);
      (mockCriteriaRepo.listByEntity as any).mockResolvedValue([]);

      const result = await qualityService.validatePbi("pbi-1");

      const titleCheck = result.checks.find(c => c.check_id === "titulo_infinitivo");
      expect(titleCheck?.passed).toBe(false);
      expect(titleCheck?.message).toContain("verbo no infinitivo");
    });
  });
});
