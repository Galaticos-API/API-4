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
  requiresPermissionScenario,
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
test("cenários preservam esclarecimentos e limites do contrato da IA", () => {
  const scenarioInput = { ...input, operation: "cenarios" as const };
  const schema = outputSchema("cenarios", "pbi") as any;
  assert.equal(schema.properties.scenarios.maxItems, 8);
  assert.equal(schema.properties.questions.maxItems, 6);
  const scenario = {
    nome: "Consultar pedido",
    tipo: "caminho_principal",
    dado: "Cliente autenticado",
    quando: "Consultar pedido",
    entao: "Pedido exibido",
  };
  const questions = ["Qual resultado deve ocorrer quando o pedido não existir?"];
  const clarification = { scenarios: [], questions };
  assert.deepEqual(parseOutput(scenarioInput, clarification), clarification);
  assert.doesNotThrow(() =>
    validateGuide(scenarioInput, clarification, defaultConfig("levantamento")),
  );
  assert.throws(() =>
    validateGuide(
      scenarioInput,
      { scenarios: [], questions: [] },
      defaultConfig("levantamento"),
    ),
  );
  assert.throws(() =>
    parseOutput(scenarioInput, {
      scenarios: Array.from({ length: 9 }, () => ({
        ...scenario,
      })),
      questions: [],
    }),
  );
  assert.throws(() =>
    parseOutput(scenarioInput, {
      scenarios: [],
      questions: Array.from({ length: 7 }, () => "Pergunta objetiva"),
    }),
  );
  assert.equal(parseOutput(scenarioInput, {
    scenarios: [scenario],
    questions: [],
  }).scenarios.length, 1);
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

const story = {
  titulo: "Consultar pedido",
  historia_como_um: "cliente",
  historia_eu_quero: "consultar meus pedidos",
  historia_para_que: "acompanhar a entrega",
};
const scenariosInput = requestSchema.parse({
  mode: "levantamento",
  operation: "cenarios",
  level: "pbi",
  fields: story,
});
const scenario = (tipo: string, nome = "Consultar pedido existente") =>
  tipo === "acesso_nao_autorizado"
    ? {
        nome,
        tipo,
        dado: "que o usuário não tem permissão para aprovar pedidos",
        quando: "ele tenta aprovar um pedido",
        entao: "o sistema recusa a ação e o pedido permanece inalterado",
      }
    : {
        nome,
        tipo,
        dado: "que o cliente possui um pedido registrado",
        quando: "ele consulta seus pedidos",
        entao: "o sistema exibe o pedido com o estado atual",
      };

test("PBI-03.1.3: sugere cenários DADO/QUANDO/ENTÃO nomeados e tipados a partir da história completa", async () => {
  const sent: Record<string, unknown>[] = [];
  const service = new HarnessService(new MemoryRepository(), {
    async generate(payload) {
      sent.push(payload);
      return { scenarios: [scenario("caminho_principal")], questions: [] };
    },
  });
  const answer = await service.run("p1", scenariosInput);
  assert.equal(answer.operation, "cenarios");
  assert.deepEqual(answer.result, {
    scenarios: [scenario("caminho_principal")],
    questions: [],
  });
  assert.deepEqual(sent[0].output_schema, outputSchema("cenarios", "pbi"));
  assert.throws(() =>
    parseOutput(scenariosInput, {
      scenarios: [{ ...scenario("caminho_principal"), tipo: "outro" }],
      questions: [],
    }),
  );
  assert.throws(() =>
    parseOutput(scenariosInput, {
      scenarios: [{ ...scenario("caminho_principal"), nome: "x".repeat(256) }],
      questions: [],
    }),
  );
  const { nome: _nome, ...semNome } = scenario("caminho_principal");
  assert.throws(() =>
    parseOutput(scenariosInput, { scenarios: [semNome], questions: [] }),
  );
});

test("PBI-03.1.3: história com permissão exige caminho principal e acesso não autorizado", () => {
  const config = defaultConfig("levantamento");
  const restricted = {
    ...scenariosInput,
    fields: {
      ...story,
      historia_eu_quero: "aprovar pedidos com o perfil de administrador",
    },
  };
  assert.equal(requiresPermissionScenario(restricted.fields, config), true);
  assert.equal(requiresPermissionScenario(story, config), false);
  // "perfil" e "administrador" como dado do domínio não indicam permissão.
  for (const historia_eu_quero of [
    "consultar o perfil público do desenvolvedor",
    "editar meu perfil",
    "cadastrar um administrador do condomínio",
  ])
    assert.equal(
      requiresPermissionScenario({ ...story, historia_eu_quero }, config),
      false,
      historia_eu_quero,
    );
  for (const regras_observacoes of [
    "Somente o proprietário pode excluir o pedido.",
    "Usuário sem permissão não visualiza o valor.",
    "Acesso restrito ao time financeiro.",
  ])
    assert.equal(
      requiresPermissionScenario({ ...story, regras_observacoes }, config),
      true,
      regras_observacoes,
    );
  assert.throws(
    () =>
      validateGuide(
        restricted,
        { scenarios: [scenario("caminho_principal")], questions: [] },
        config,
      ),
    /acesso não autorizado/,
  );
  assert.throws(
    () =>
      validateGuide(
        restricted,
        { scenarios: [scenario("acesso_nao_autorizado")], questions: [] },
        config,
      ),
    /caminho principal/,
  );
  assert.doesNotThrow(() =>
    validateGuide(
      restricted,
      {
        scenarios: [
          scenario("caminho_principal"),
          scenario("acesso_nao_autorizado", "Recusar usuário sem permissão"),
        ],
        questions: [],
      },
      config,
    ),
  );
  // Termo de permissão no contexto de edição não conta: só história e regras.
  assert.equal(
    requiresPermissionScenario(
      { ...story, texto_livre: "perfil administrador" },
      config,
    ),
    false,
  );
});

test("PBI-03.1.3: cenário de acesso não autorizado precisa descrever a recusa no ENTÃO", () => {
  const config = defaultConfig("levantamento");
  const contraditorio = {
    ...scenario("acesso_nao_autorizado", "Recusar usuário sem permissão"),
    entao: "o sistema exibe o pedido com o estado atual",
  };
  assert.throws(
    () =>
      validateGuide(
        scenariosInput,
        { scenarios: [scenario("caminho_principal"), contraditorio], questions: [] },
        config,
      ),
    /sem recusa/,
  );
  for (const entao of [
    "o sistema recusa a aprovação",
    "o acesso é negado e uma mensagem de permissão é exibida",
    "a exclusão não é permitida",
    "o pedido permanece inalterado",
  ])
    assert.doesNotThrow(
      () =>
        validateGuide(
          scenariosInput,
          {
            scenarios: [
              scenario("caminho_principal"),
              { ...contraditorio, entao },
            ],
            questions: [],
          },
          config,
        ),
      entao,
    );
});

test("PBI-03.1.3: cenários descrevem comportamento, e lista vazia só com perguntas", () => {
  const config = defaultConfig("levantamento");
  assert.throws(() =>
    validateGuide(
      scenariosInput,
      {
        scenarios: [
          { ...scenario("caminho_principal"), entao: "o endpoint grava no SQL" },
        ],
        questions: [],
      },
      config,
    ),
  );
  assert.throws(() =>
    validateGuide(scenariosInput, { scenarios: [], questions: [] }, config),
  );
  assert.doesNotThrow(() =>
    validateGuide(
      scenariosInput,
      { scenarios: [], questions: ["Qual estado o pedido deve exibir?"] },
      config,
    ),
  );
});

test("PBI-03.1.3: história incompleta pede preenchimento sem chamar o modelo", async () => {
  let calls = 0;
  const service = new HarnessService(new MemoryRepository(), {
    async generate() {
      calls++;
      return { scenarios: [scenario("caminho_principal")], questions: [] };
    },
  });
  for (const [field, value] of [
    ["historia_como_um", ""],
    ["historia_eu_quero", "   "],
    ["historia_para_que", ""],
  ] as const)
    await assert.rejects(
      service.run("p1", {
        ...scenariosInput,
        fields: { ...story, [field]: value },
      }),
      (error: any) =>
        error.statusCode === 400 &&
        error.code === "HISTORIA_INCOMPLETA" &&
        error.details.campos.includes(field),
    );
  assert.equal(calls, 0);
});

test("revisão salva antes da S2-11 recebe os termos de permissão padrão", () => {
  const { permission_terms: _terms, ...legacyRules } =
    defaultConfig("levantamento").rules;
  const config = validateConfig("levantamento", {
    ...defaultConfig("levantamento"),
    rules: legacyRules,
  });
  assert.deepEqual(
    config.rules.permission_terms,
    defaultConfig("levantamento").rules.permission_terms,
  );
  assert.throws(() =>
    validateConfig("levantamento", {
      ...defaultConfig("levantamento"),
      rules: { ...legacyRules, permission_terms: [] },
    }),
  );
});
