import test from "node:test";
import assert from "node:assert/strict";
import { QualityService } from "./quality.service.js";
import { PbisRepository } from "../pbis/pbis.repository.js";
import { CriteriaRepository } from "../criteria/criteria.repository.js";
import { NotFoundError } from "../../shared/errors.js";

class MockPbisRepository extends PbisRepository {
  private pbis: Map<string, any> = new Map();

  constructor() { super(); }

  async findById(id: string): Promise<any> {
    return this.pbis.get(id) || null;
  }

  setPbi(pbi: any) {
    this.pbis.set(pbi.id, pbi);
  }
}

class MockCriteriaRepository extends CriteriaRepository {
  private criteria: Map<string, any[]> = new Map();

  constructor() { super(); }

  async listByEntity(entityType: string, entityId: string): Promise<any[]> {
    return this.criteria.get(entityId) || [];
  }

  setCriteria(entityId: string, criteria: any[]) {
    this.criteria.set(entityId, criteria);
  }
}

test("QualityService - validatePbi throws NotFoundError when PBI does not exist", async () => {
  const mockPbisRepo = new MockPbisRepository();
  const mockCriteriaRepo = new MockCriteriaRepository();
  const qualityService = new QualityService(mockPbisRepo, mockCriteriaRepo);

  await assert.rejects(
    () => qualityService.validatePbi("non-existent-id"),
    NotFoundError
  );
});

test("QualityService - validatePbi returns quality report with completeness score", async () => {
  const mockPbisRepo = new MockPbisRepository();
  const mockCriteriaRepo = new MockCriteriaRepository();
  const qualityService = new QualityService(mockPbisRepo, mockCriteriaRepo);

  const mockPbi = {
    id: "pbi-1",
    titulo: "Criar usuário",
    historia_como_um: "Como um administrador",
    historia_eu_quero: "eu quero criar um usuário",
    historia_para_que: "para que possa acessar o sistema",
    regras_observacoes: null,
  };

  mockPbisRepo.setPbi(mockPbi);
  mockCriteriaRepo.setCriteria("pbi-1", [
    {
      id: "c1",
      dado: "Dado que sou administrador",
      quando: "Quando acesso a tela de usuários",
      entao: "Então vejo o botão criar",
    },
  ]);

  const result = await qualityService.validatePbi("pbi-1");

  assert.equal(result.entity_type, "pbi");
  assert.equal(result.entity_id, "pbi-1");
  assert.equal(result.checks.length, 4);
  assert.ok((result.score_completude ?? 0) > 0);
});

test("QualityService - validatePbi calculates completeness score", async () => {
  const mockPbisRepo = new MockPbisRepository();
  const mockCriteriaRepo = new MockCriteriaRepository();
  const qualityService = new QualityService(mockPbisRepo, mockCriteriaRepo);

  const mockPbi = {
    id: "pbi-1",
    titulo: "Criar usuário",
    historia_como_um: "Como um administrador",
    historia_eu_quero: "eu quero criar um usuário",
    historia_para_que: "para que possa acessar o sistema",
    regras_observacoes: "O sistema deve validar os campos",
  };

  mockPbisRepo.setPbi(mockPbi);
  mockCriteriaRepo.setCriteria("pbi-1", [
    {
      id: "c1",
      dado: "Dado que sou administrador",
      quando: "Quando acesso a tela de usuários",
      entao: "Então vejo o botão criar",
    },
  ]);

  const result = await qualityService.validatePbi("pbi-1");

  // Should calculate a completeness score
  assert.ok(result.score_completude !== null);
  assert.ok(result.score_completude >= 0);
  assert.ok(result.score_completude <= 100);
});

test("QualityService - validatePbi identifies missing user story blocks", async () => {
  const mockPbisRepo = new MockPbisRepository();
  const mockCriteriaRepo = new MockCriteriaRepository();
  const qualityService = new QualityService(mockPbisRepo, mockCriteriaRepo);

  const mockPbi = {
    id: "pbi-1",
    titulo: "Criar usuário",
    historia_como_um: "Como um administrador",
    historia_eu_quero: "  ",
    historia_para_que: "para que possa acessar o sistema",
    regras_observacoes: null,
  };

  mockPbisRepo.setPbi(mockPbi);
  mockCriteriaRepo.setCriteria("pbi-1", []);

  const result = await qualityService.validatePbi("pbi-1");

  const historyCheck = result.checks.find(c => c.check_id === "historia_completa");
  assert.ok(historyCheck);
  assert.equal(historyCheck.passed, false);
  assert.ok(historyCheck.message.includes("EU QUERO"));
});

test("QualityService - validatePbi identifies incomplete scenarios", async () => {
  const mockPbisRepo = new MockPbisRepository();
  const mockCriteriaRepo = new MockCriteriaRepository();
  const qualityService = new QualityService(mockPbisRepo, mockCriteriaRepo);

  const mockPbi = {
    id: "pbi-1",
    titulo: "Criar usuário",
    historia_como_um: "Como um administrador",
    historia_eu_quero: "eu quero criar um usuário",
    historia_para_que: "para que possa acessar o sistema",
    regras_observacoes: null,
  };

  mockPbisRepo.setPbi(mockPbi);
  mockCriteriaRepo.setCriteria("pbi-1", [
    {
      id: "c1",
      dado: "Dado que sou administrador",
      quando: "",
      entao: "Então vejo o botão criar",
    },
  ]);

  const result = await qualityService.validatePbi("pbi-1");

  const scenarioCheck = result.checks.find(c => c.check_id === "cenario_estruturado");
  assert.ok(scenarioCheck);
  assert.equal(scenarioCheck.passed, false);
  assert.ok(scenarioCheck.message.includes("incompletos"));
});

test("QualityService - validatePbi identifies vague terms", async () => {
  const mockPbisRepo = new MockPbisRepository();
  const mockCriteriaRepo = new MockCriteriaRepository();
  const qualityService = new QualityService(mockPbisRepo, mockCriteriaRepo);

  const mockPbi = {
    id: "pbi-1",
    titulo: "Criar usuário rápido",
    historia_como_um: "Como um administrador",
    historia_eu_quero: "eu quero criar um usuário",
    historia_para_que: "para que o sistema seja eficiente",
    regras_observacoes: "A interface deve ser intuitiva",
  };

  mockPbisRepo.setPbi(mockPbi);
  mockCriteriaRepo.setCriteria("pbi-1", []);

  const result = await qualityService.validatePbi("pbi-1");

  const vagueCheck = result.checks.find(c => c.check_id === "termos_vagos");
  assert.ok(vagueCheck);
  assert.equal(vagueCheck.passed, false);
  assert.ok(vagueCheck.message.includes("termos vagos"));
});

test("QualityService - validatePbi validates title starts with verb in infinitive", async () => {
  const mockPbisRepo = new MockPbisRepository();
  const mockCriteriaRepo = new MockCriteriaRepository();
  const qualityService = new QualityService(mockPbisRepo, mockCriteriaRepo);

  const mockPbi = {
    id: "pbi-1",
    titulo: "Tela de usuários",
    historia_como_um: "Como um administrador",
    historia_eu_quero: "eu quero criar um usuário",
    historia_para_que: "para que possa acessar o sistema",
    regras_observacoes: null,
  };

  mockPbisRepo.setPbi(mockPbi);
  mockCriteriaRepo.setCriteria("pbi-1", []);

  const result = await qualityService.validatePbi("pbi-1");

  const titleCheck = result.checks.find(c => c.check_id === "titulo_infinitivo");
  assert.ok(titleCheck);
  assert.equal(titleCheck.passed, false);
  assert.ok(titleCheck.message.includes("verbo no infinitivo"));
});
