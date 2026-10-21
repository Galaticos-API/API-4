import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultConfig,
  outputSchema,
  parseOutput,
  requestSchema,
  type HarnessMode,
  type HarnessRevision,
} from "./harness.contract.js";
import { HarnessRepository } from "./harness.repository.js";
import {
  HarnessService,
  validateConfig,
  validateGuide,
} from "./harness.service.js";

const input = requestSchema.parse({
  mode: "levantamento",
  operation: "padronizar",
  level: "pbi",
  fields: { titulo: "Consultar pedido" },
});
const proposal = {
  titulo: "Consultar pedido",
  historia_como_um: "cliente",
  historia_eu_quero: "consultar pedido",
  historia_para_que: "acompanhar entrega",
  regras_observacoes: "",
};
const result = { proposal, questions: [] };
class MemoryRepository extends HarnessRepository {
  readonly revisions = new Map<HarnessMode, HarnessRevision>();
  override async current(mode: HarnessMode) {
    return (
      this.revisions.get(mode) ?? {
        mode,
        version: 0,
        schema_version: 1 as const,
        config: defaultConfig(mode),
        created_at: null,
        created_by: null,
      }
    );
  }
  override async save(
    mode: HarnessMode,
    expected: number,
    config: ReturnType<typeof defaultConfig>,
    user: string,
  ) {
    const row = {
      ...(await this.current(mode)),
      version: expected + 1,
      config,
      created_by: user,
    };
    this.revisions.set(mode, row);
    return row;
  }
}
test("próxima solicitação usa revisão nova, sem contaminar outro modo nem a requisição em voo", async () => {
  const repository = new MemoryRepository();
  const calls: Record<string, unknown>[] = [];
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = new HarnessService(repository, {
    async generate(payload) {
      calls.push(structuredClone(payload));
      if (calls.length === 1) await waiting;
      return result;
    },
  });
  const first = service.run("p1", input);
  await new Promise((resolve) => setImmediate(resolve));
  const config = {
    ...defaultConfig("levantamento"),
    instructions: "Nova orientação independente",
  };
  await service.save("levantamento", 0, config, "admin");
  const second = await service.run("p1", input);
  release();
  assert.equal((await first).version, 0);
  assert.equal(second.version, 1);
  assert.equal(
    (calls[0].config as typeof config).instructions,
    defaultConfig("levantamento").instructions,
  );
  assert.equal(
    (calls[1].config as typeof config).instructions,
    config.instructions,
  );
  assert.equal((await service.current("consulta")).version, 0);
});
test("configuração rejeita operação de outro modo, campo desconhecido e limites inválidos", () => {
  const config = defaultConfig("levantamento");
  for (const bad of [
    { ...config, operation_instructions: { responder: "Responder" } },
    { ...config, timeout_ms: 0 },
    { ...config, url: "https://externo.invalid" },
    { ...config, rules: { ...config.rules, macro_detail_terms: [] } },
  ])
    assert.throws(() => validateConfig("levantamento", bad));
});
test("schemas independentes por operação e nível; saída inválida falha fechada", () => {
  assert.notDeepEqual(
    outputSchema("padronizar", "epico"),
    outputSchema("padronizar", "pbi"),
  );
  assert.throws(() =>
    parseOutput(input, { ...result, proposal: { ...proposal, sql: "INSERT" } }),
  );
  assert.throws(() =>
    parseOutput(input, { ...result, proposal: { titulo: "Consultar" } }),
  );
  assert.throws(() =>
    parseOutput(
      { ...input, operation: "questionar" },
      {
        questions: [{ dimension: "inventada", question: "Qual?" }],
        summary: "Análise",
      },
    ),
  );
  assert.doesNotThrow(() =>
    parseOutput(
      { ...input, operation: "questionar" },
      { questions: [], summary: "Nenhuma lacuna relevante identificada." },
    ),
  );
});
test("guia exige infinitivo, história, granularidade e resultado de produto", () => {
  const config = defaultConfig("levantamento");
  assert.doesNotThrow(() => validateGuide(input, result, config));
  assert.throws(() =>
    validateGuide(
      input,
      { ...result, proposal: { ...proposal, titulo: "Pedido novo" } },
      config,
    ),
  );
  assert.throws(() =>
    validateGuide(
      input,
      {
        ...result,
        proposal: { ...proposal, historia_eu_quero: "criar endpoint SQL" },
      },
      config,
    ),
  );
  assert.throws(() =>
    parseOutput(input, {
      ...result,
      proposal: { ...proposal, historia_como_um: " " },
    }),
  );
  const epic = {
    titulo: "Digitalizar pedidos",
    descricao: "Transformação do atendimento",
    objetivo: "Reduzir espera",
    escopo_macro: "clique no botão",
    resultado_esperado: "Atendimento autônomo",
  };
  assert.throws(() =>
    validateGuide(
      { ...input, level: "epico" },
      { proposal: epic, questions: [] },
      config,
    ),
  );
  assert.doesNotThrow(() =>
    validateGuide(
      input,
      { proposal: null, questions: ["Qual ator realiza a consulta?"] },
      config,
    ),
  );
  assert.throws(() =>
    validateGuide(input, { proposal: null, questions: [] }, config),
  );
});
test("saída inválida e erro com dados sensíveis viram indisponibilidade segura, sem persistir", async () => {
  for (const generate of [
    async () => {
      throw Error("SEGREDO prompt/token");
    },
    async () => ({
      proposal: { ...proposal, titulo: "Pedido" },
      questions: [],
    }),
  ]) {
    const repository = new MemoryRepository();
    const service = new HarnessService(repository, { generate });
    await assert.rejects(
      service.run("p1", input),
      (error: any) =>
        error.statusCode === 503 && !error.message.includes("SEGREDO"),
    );
    assert.equal(repository.revisions.size, 0);
  }
});
test("consulta e recomendação rejeitam fontes que não foram recuperadas no projeto", () => {
  const source = "60000000-0000-4000-8000-000000000001";
  assert.throws(() =>
    validateGuide(
      { ...input, mode: "consulta", operation: "responder" },
      { answer: "Resposta inventada", sources: [source] },
      defaultConfig("consulta"),
    ),
  );
  assert.throws(() =>
    validateGuide(
      { ...input, mode: "consulta", operation: "responder" },
      { answer: "Resposta inventada", sources: [] },
      defaultConfig("consulta"),
    ),
  );
  assert.throws(() =>
    validateGuide(
      { ...input, mode: "recomendacao", operation: "similares" },
      { items: [{ source_id: source, reason: "Similar" }] },
      defaultConfig("recomendacao"),
    ),
  );
});
test("não envia combinações inválidas nem campos fora do nível ao modelo", async () => {
  let calls = 0;
  const service = new HarnessService(new MemoryRepository(), {
    async generate() {
      calls++;
      return result;
    },
  });
  for (const bad of [
    { ...input, mode: "consulta" as const },
    { ...input, level: "epico" as const, operation: "cenarios" },
    { ...input, fields: { sql: "segredo" } },
  ])
    await assert.rejects(service.run("p1", bad));
  assert.equal(calls, 0);
});

test("fixture Python permanece igual aos schemas publicados pelo backend", async () => {
  const { readFile } = await import("node:fs/promises");
  const { OPERATIONS, LEVELS } = await import("./harness.contract.js");
  const fixture = JSON.parse(
    await readFile("../ai-service/tests/fixtures/harness.json", "utf8"),
  );
  for (const operation of Object.values(OPERATIONS).flat())
    for (const level of LEVELS)
      assert.deepEqual(
        fixture.schemas[operation][level],
        outputSchema(operation, level),
      );
  assert.deepEqual(fixture.config, defaultConfig("levantamento"));
});

test("padronização respeita limites dos campos que receberão sugestões", () => {
  assert.throws(() =>
    parseOutput(input, {
      ...result,
      proposal: { ...proposal, titulo: "Consultar " + "x".repeat(255) },
    }),
  );
  assert.throws(() =>
    parseOutput(input, {
      ...result,
      proposal: { ...proposal, historia_eu_quero: "x".repeat(5001) },
    }),
  );
});
