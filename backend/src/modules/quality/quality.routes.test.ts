import test from "node:test";
import assert from "node:assert/strict";
import { QualityController } from "./quality.controller.js";
import { QualityService } from "./quality.service.js";
import { PbisRepository } from "../pbis/pbis.repository.js";
import { CriteriaRepository } from "../criteria/criteria.repository.js";
import { NotFoundError } from "../../shared/errors.js";
import { NextFunction } from "express";

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

test("QualityController - validatePbi calls service and returns result", async () => {
  const mockPbisRepo = new MockPbisRepository();
  const mockCriteriaRepo = new MockCriteriaRepository();
  const qualityService = new QualityService(mockCriteriaRepo, mockPbisRepo);
  const qualityController = new QualityController(qualityService);

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

  const mockReq = { params: { id: "pbi-1" } } as any;
  const mockRes = {
    status: (code: number) => mockRes,
    json: (data: any) => { mockRes.jsonData = data; return mockRes; },
  } as any;
  const mockNext = () => {};

  await qualityController.validatePbi(mockReq, mockRes, mockNext);

  assert.equal(mockRes.jsonData.entity_type, "pbi");
  assert.equal(mockRes.jsonData.entity_id, "pbi-1");
  assert.ok(mockRes.jsonData.score_completude > 0);
});

test("QualityController - validatePbi calls next with error when service fails", async () => {
  const mockPbisRepo = new MockPbisRepository();
  const mockCriteriaRepo = new MockCriteriaRepository();
  const qualityService = new QualityService(mockCriteriaRepo, mockPbisRepo);
  const qualityController = new QualityController(qualityService);

  const mockReq = { params: { id: "non-existent" } } as any;
  let capturedError: Error | null = null;
  const mockNext = ((error: unknown) => {
    const receivedError: unknown = error;
    capturedError = receivedError instanceof Error ? receivedError : new Error(String(receivedError));
  }) as NextFunction;

  await qualityController.validatePbi(mockReq, {} as any, mockNext);

  assert.ok(capturedError);
  assert.equal((capturedError as Error).name, new NotFoundError().name);
});

test("QualityController - exposes current organization configuration", async () => {
  const expected = { rule_version: "pbi-quality-v4", checks: {}, vague_terms: [], updated_at: new Date().toISOString(), updated_by: null };
  const repository = { getPbiConfiguration: async () => expected } as any;
  const controller = new QualityController(undefined, repository);
  const res = { status: (code: number) => { res.statusCode = code; return res; }, json: (data: unknown) => { res.body = data; return res; } } as any;

  await controller.getPbiConfiguration({} as any, res, (() => {}) as NextFunction);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body, expected);
});

test("QualityController - validates and attributes configuration updates to authenticated admin", async () => {
  let saved: unknown;
  let savedBy: string | undefined;
  const repository = {
    updatePbiConfiguration: async (input: unknown, userId: string) => { saved = input; savedBy = userId; return { rule_version: "pbi-quality-v2" }; },
  } as any;
  const controller = new QualityController(undefined, repository);
  const payload = {
    checks: { titulo_infinitivo: true, historia_completa: true, cenario_estruturado: false, termos_vagos: true },
    vague_terms: ["simples"],
  };
  const res = { status: (code: number) => { res.statusCode = code; return res; }, json: (data: unknown) => { res.body = data; return res; } } as any;
  await controller.updatePbiConfiguration({ body: payload, auth: { id: "admin-1" } } as any, res, (() => {}) as NextFunction);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(saved, payload);
  assert.equal(savedBy, "admin-1");

  const invalidResponse = { status: (code: number) => { invalidResponse.statusCode = code; return invalidResponse; }, json: (data: unknown) => { invalidResponse.body = data; return invalidResponse; } } as any;
  await controller.updatePbiConfiguration({ body: { checks: {}, vague_terms: [] }, auth: { id: "admin-1" } } as any, invalidResponse, (() => {}) as NextFunction);
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(savedBy, "admin-1");
});
