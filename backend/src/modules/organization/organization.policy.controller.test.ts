import test from "node:test";
import assert from "node:assert/strict";
import { OrganizationPolicyController } from "./organization.policy.controller.js";
import { OrganizationPolicyRepository } from "./organization.policy.repository.js";
import { OrganizationPolicy, OrganizationPolicyInput } from "./organization.policy.types.js";
import { ValidationError } from "../../shared/errors.js";

class InMemoryPolicyRepository extends OrganizationPolicyRepository {
  public policy: OrganizationPolicy = {
    justificativa_alteracao_obrigatoria: true,
    updated_at: new Date().toISOString(),
    updated_by: null,
  };

  constructor() { super(); }

  async get(): Promise<OrganizationPolicy> {
    return this.policy;
  }

  async update(input: OrganizationPolicyInput, usuarioId: string): Promise<OrganizationPolicy> {
    this.policy = {
      justificativa_alteracao_obrigatoria: input.justificativa_alteracao_obrigatoria,
      updated_at: new Date().toISOString(),
      updated_by: { id: usuarioId, nome: "Admin" },
    };
    return this.policy;
  }
}

test("GET da política retorna o valor vigente da organização", async () => {
  const repository = new InMemoryPolicyRepository();
  const controller = new OrganizationPolicyController(repository);
  const res = { statusCode: 0, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  await controller.get({} as never, res as never, () => undefined);
  assert.equal(res.statusCode, 200);
  assert.equal((res.body as OrganizationPolicy).justificativa_alteracao_obrigatoria, true);
});

test("PUT da política recusa corpo inválido", async () => {
  const controller = new OrganizationPolicyController(new InMemoryPolicyRepository());
  let captured: unknown;
  await controller.update(
    { body: {}, auth: { id: "user-1" } } as never,
    { status() { return this; }, json() { return this; } } as never,
    (error) => { captured = error; },
  );
  assert.ok(captured instanceof ValidationError);
});

test("PUT da política persiste a obrigatoriedade informada", async () => {
  const repository = new InMemoryPolicyRepository();
  const controller = new OrganizationPolicyController(repository);
  const res = { statusCode: 0, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  await controller.update(
    { body: { justificativa_alteracao_obrigatoria: false }, auth: { id: "11111111-1111-4111-8111-111111111111" } } as never,
    res as never,
    () => undefined,
  );
  assert.equal(res.statusCode, 200);
  assert.equal((res.body as OrganizationPolicy).justificativa_alteracao_obrigatoria, false);
});
