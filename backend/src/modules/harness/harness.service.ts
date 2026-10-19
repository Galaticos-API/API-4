import axios from "axios";
import { env } from "../../config/env.js";
import { serviceHeaders } from "../../shared/service-auth.js";
import { AppError, ValidationError } from "../../shared/errors.js";
import { validarTituloInfinitivo } from "../quality/quality.rules.js";
import { ChatRepository } from "../chat/chat.repository.js";
import { searchPatterns } from "./search-patterns.js";
import { HarnessRepository } from "./harness.repository.js";
import {
  configSchema,
  FIELDS,
  OPERATIONS,
  outputSchema,
  parseOutput,
  type HarnessConfig,
  type HarnessInput,
  type HarnessMode,
  type HarnessRevision,
} from "./harness.contract.js";

export interface HarnessEngine {
  generate(payload: Record<string, unknown>, timeout: number): Promise<unknown>;
}
export class HttpHarnessEngine implements HarnessEngine {
  constructor(private readonly baseUrl = env.AI_SERVICE_URL) {}
  async generate(payload: Record<string, unknown>, timeout: number) {
    const response = await axios.post(this.baseUrl + "/harness/run", payload, {
      headers: serviceHeaders(),
      timeout,
      maxContentLength: 200000,
    });
    if (
      response.data?.mode !== payload.mode ||
      response.data?.version !== payload.version ||
      response.data?.schema_version !== payload.schema_version
    )
      throw new Error("Revisão de resposta incompatível");
    return response.data.result;
  }
}
export function validateConfig(
  mode: HarnessMode,
  value: unknown,
): HarnessConfig {
  const parsed = configSchema.safeParse(value);
  if (!parsed.success)
    throw new ValidationError("Configuração do harness inválida.");
  const keys = Object.keys(parsed.data.operation_instructions).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...OPERATIONS[mode]].sort()))
    throw new ValidationError(
      "As instruções devem contemplar exatamente as operações do modo.",
    );
  return parsed.data;
}
function containsTerm(value: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    "(?<![\\p{L}\\p{N}])" + escaped + "(?![\\p{L}\\p{N}])",
    "iu",
  ).test(value);
}
export function validateGuide(
  input: HarnessInput,
  result: any,
  config: HarnessConfig,
) {
  const ids = new Set(input.context.map((chunk) => chunk.id));
  if (input.operation === "responder") {
    if (result.sources.some((id: string) => !ids.has(id)))
      throw Error("Fonte inválida");
    if (
      !result.sources.length &&
      result.answer !== "Informação não encontrada no acervo do projeto."
    )
      throw Error("Resposta sem fundamento");
  }
  if (
    input.operation === "similares" &&
    result.items.some((item: { source_id: string }) => !ids.has(item.source_id))
  )
    throw Error("Origem inválida");
  if (input.operation !== "padronizar") return;
  if (!result.proposal) {
    if (!result.questions.length)
      throw Error("Proposta ausente sem esclarecimento");
    return;
  }
  const fields = result.proposal as Record<string, string>;
  if (input.level === "pbi" && !validarTituloInfinitivo(fields.titulo).aprovado)
    throw Error("Título fora do guia");
  const content = Object.values(fields).join("\n");
  if (
    input.level !== "pbi" &&
    config.rules.macro_detail_terms.some((term) => containsTerm(content, term))
  )
    throw Error("Granularidade incorreta");
  if (
    config.rules.implementation_terms.some((term) =>
      containsTerm(content, term),
    )
  )
    throw Error("Descrição de implementação");
}
export class HarnessService {
  constructor(
    private readonly repository = new HarnessRepository(),
    private readonly engine: HarnessEngine = new HttpHarnessEngine(),
    private readonly chunks = new ChatRepository(),
  ) {}
  current(mode: HarnessMode) {
    return this.repository.current(mode);
  }
  history(mode: HarnessMode, before?: number) {
    return this.repository.history(mode, before);
  }
  save(mode: HarnessMode, version: number, config: unknown, userId: string) {
    return this.repository.save(
      mode,
      version,
      validateConfig(mode, config),
      userId,
    );
  }
  async run(
    projectId: string,
    input: HarnessInput,
    trustedContext?: HarnessInput["context"],
  ) {
    if (
      !(OPERATIONS[input.mode] as readonly string[]).includes(input.operation)
    )
      throw new ValidationError("Operação incompatível com o modo.");
    if (input.operation === "cenarios" && input.level !== "pbi")
      throw new ValidationError("Cenários detalhados são exclusivos de PBI.");
    const allowed: readonly string[] =
      input.mode === "levantamento"
        ? [...FIELDS[input.level], "texto_livre"]
        : ["pergunta"];
    if (
      Object.keys(input.fields).some((field) => !allowed.includes(field)) ||
      !Object.values(input.fields).some((value) => value.trim())
    )
      throw new ValidationError(
        "Informe os campos do nível ou a pergunta do modo selecionado.",
      );
    const revision = await this.repository.current(input.mode);
    const config = validateConfig(input.mode, revision.config);
    // Cada requisição lê a revisão vigente; nada é mantido em cache de processo.
    const context =
      input.mode === "levantamento"
        ? []
        : (trustedContext ??
          (
            await this.chunks.searchChunks(
              projectId,
              searchPatterns(input.fields.pergunta ?? ""),
              10,
            )
          ).map((row) => ({ id: row.id, text: row.texto.slice(0, 8000) })));
    const scoped = { ...input, context };
    try {
      const result = parseOutput(
        scoped,
        await this.engine.generate(
          {
            mode: input.mode,
            operation: input.operation,
            level: input.level,
            version: revision.version,
            schema_version: revision.schema_version,
            config,
            output_schema: outputSchema(input.operation, input.level),
            fields: input.fields,
            context,
          },
          config.timeout_ms,
        ),
      );
      validateGuide(scoped, result, config);
      return {
        mode: input.mode,
        version: revision.version,
        schema_version: revision.schema_version,
        operation: input.operation,
        level: input.level,
        result,
      };
    } catch {
      // Não propaga o erro do provedor: ele pode incluir prompt, resposta ou credenciais.
      throw new AppError(
        "A IA está indisponível ou retornou uma proposta fora do padrão. Sua edição foi preservada.",
        503,
        "AI_HARNESS_UNAVAILABLE",
      );
    }
  }
}
export function describeRevision(revision: HarnessRevision) {
  return {
    ...revision,
    output_schemas: Object.fromEntries(
      OPERATIONS[revision.mode].map((op) => [
        op,
        Object.fromEntries(
          (["epico", "feature", "pbi"] as const).map((level) => [
            level,
            outputSchema(op, level),
          ]),
        ),
      ]),
    ),
  };
}
