import { apiRequest } from "./api_auth";
import type { Criterion } from "./api_backlog";

export type CopilotLevel = "epico" | "feature" | "pbi";
export type CopilotMode = "questionar" | "padronizar";
export const COPILOT_FIELDS = {
  epico: [
    "titulo",
    "descricao",
    "objetivo",
    "escopo_macro",
    "resultado_esperado",
  ],
  feature: ["titulo", "descricao", "objetivo"],
  pbi: [
    "titulo",
    "historia_como_um",
    "historia_eu_quero",
    "historia_para_que",
    "regras_observacoes",
  ],
} as const;
export const FIELD_LABELS: Record<string, string> = {
  titulo: "Título",
  descricao: "Descrição",
  objetivo: "Objetivo",
  escopo_macro: "Escopo macro",
  resultado_esperado: "Resultado esperado",
  historia_como_um: "Como um",
  historia_eu_quero: "Eu quero",
  historia_para_que: "Para que",
  regras_observacoes: "Regras e observações",
};
export const DIMENSION_LABELS = {
  caminho_principal: "Caminho principal",
  validacoes: "Validações",
  erros_indisponibilidade: "Erros e indisponibilidade",
  permissoes_seguranca: "Permissões e segurança",
  estados_alternativos: "Estados alternativos",
  interface: "Interface e compatibilidade",
} as const;
export type CopilotAnswer =
  | {
      operation: "questionar";
      version: number;
      summary: string;
      questions: {
        dimension: keyof typeof DIMENSION_LABELS;
        question: string;
      }[];
    }
  | {
      operation: "padronizar";
      version: number;
      proposal: Record<string, string> | null;
      questions: string[];
    };

export function copilotFields(
  level: CopilotLevel,
  values: object,
): Record<string, string> {
  const source = values as Record<string, unknown>;
  return Object.fromEntries(
    COPILOT_FIELDS[level].map((field) => [
      field,
      typeof source[field] === "string" ? source[field] : "",
    ]),
  );
}
export function copilotInput(
  level: CopilotLevel,
  values: object,
  criteria: Criterion[] | null,
) {
  const fields = copilotFields(level, values);
  const source = values as Record<string, unknown>;
  const context = {
    ...(level === "pbi"
      ? { requer_interface: source.requer_interface === true }
      : {}),
    criterios_disponiveis: criteria !== null,
    criterios_salvos:
      criteria?.map(({ texto, nome, dado, quando, entao }) => ({
        texto,
        nome,
        dado,
        quando,
        entao,
      })) ?? [],
  };
  return { ...fields, texto_livre: JSON.stringify(context) };
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: readonly string[]) =>
  Object.keys(value).length === expected.length &&
  expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const text = (value: unknown, max = 12000): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
export function parseCopilotAnswer(
  value: unknown,
  operation: CopilotMode,
  level: CopilotLevel,
): CopilotAnswer {
  const invalid = () =>
    new Error(
      "A IA retornou uma resposta incompatível. Sua edição foi preservada.",
    );
  if (
    !record(value) ||
    value.mode !== "levantamento" ||
    value.operation !== operation ||
    value.level !== level ||
    value.schema_version !== 1 ||
    !Number.isInteger(value.version) ||
    (value.version as number) < 0 ||
    !record(value.result)
  )
    throw invalid();
  const result = value.result,
    version = value.version as number;
  if (operation === "questionar") {
    if (
      !keys(result, ["summary", "questions"]) ||
      !text(result.summary) ||
      !Array.isArray(result.questions) ||
      result.questions.length > 30
    )
      throw invalid();
    const questions = result.questions.map((item) => {
      if (
        !record(item) ||
        !keys(item, ["dimension", "question"]) ||
        typeof item.dimension !== "string" ||
        !Object.prototype.hasOwnProperty.call(
          DIMENSION_LABELS,
          item.dimension,
        ) ||
        !text(item.question)
      )
        throw invalid();
      return {
        dimension: item.dimension as keyof typeof DIMENSION_LABELS,
        question: item.question,
      };
    });
    return { operation, version, summary: result.summary, questions };
  }
  if (
    !keys(result, ["proposal", "questions"]) ||
    !Array.isArray(result.questions) ||
    result.questions.length > 30 ||
    !result.questions.every((item) => text(item))
  )
    throw invalid();
  if (result.proposal !== null) {
    if (
      !record(result.proposal) ||
      !keys(result.proposal, COPILOT_FIELDS[level])
    )
      throw invalid();
    for (const [field, value] of Object.entries(result.proposal)) {
      if (
        typeof value !== "string" ||
        value.length > (field === "titulo" ? 255 : 5000) ||
        (field !== "regras_observacoes" && !value.trim())
      )
        throw invalid();
    }
  } else if (!result.questions.length) throw invalid();
  return {
    operation,
    version,
    proposal: result.proposal as Record<string, string> | null,
    questions: result.questions as string[],
  };
}
export async function askCopilot(
  projectId: string,
  level: CopilotLevel,
  operation: CopilotMode,
  fields: Record<string, string>,
  signal: AbortSignal,
) {
  if (Object.values(fields).some((value) => value.length > 6000))
    throw new Error(
      "O conteúdo excede o limite de análise de 6.000 caracteres por campo. Sua edição foi preservada.",
    );
  const response = await apiRequest(
    `/projects/${encodeURIComponent(projectId)}/ai/requests`,
    {
      method: "POST",
      signal,
      body: JSON.stringify({ mode: "levantamento", operation, level, fields }),
    },
  );
  return parseCopilotAnswer(await response.json(), operation, level);
}
