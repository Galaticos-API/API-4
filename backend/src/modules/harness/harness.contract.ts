import { maxLengthFor } from "../provenance/provenance.js";
import { z } from "zod";

export const MODES = ["levantamento", "consulta", "recomendacao"] as const;
export type HarnessMode = (typeof MODES)[number];
export const LEVELS = ["epico", "feature", "pbi"] as const;
export type HarnessLevel = (typeof LEVELS)[number];
export const OPERATIONS = {
  levantamento: ["questionar", "padronizar", "cenarios"],
  consulta: ["responder"],
  recomendacao: ["similares"],
} as const;
export const DIMENSIONS = [
  "caminho_principal",
  "validacoes",
  "erros_indisponibilidade",
  "permissoes_seguranca",
  "estados_alternativos",
  "interface",
] as const;
export const FIELDS = {
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
export const SCENARIO_TYPES = [
  "caminho_principal",
  "acesso_nao_autorizado",
  "alternativo",
] as const;
// Termos que indicam ação sujeita a permissão (PBI-03.1.3, cenário 2).
export const PERMISSION_TERMS = [
  "permissão",
  "permissões",
  "autorização",
  "autorizado",
  "autorizada",
  "autorizados",
  "perfil",
  "perfis",
  "administrador",
  "administradores",
  "proprietário",
  "proprietária",
] as const;
const text = z.string().trim().min(1).max(12000);
export const rulesSchema = z
  .object({
    vague_terms: z.array(z.string().trim().min(1).max(60)).max(40),
    macro_detail_terms: z
      .array(z.string().trim().min(1).max(60))
      .min(1)
      .max(40),
    implementation_terms: z
      .array(z.string().trim().min(1).max(60))
      .min(1)
      .max(40),
    // Revisões salvas antes da S2-11 não têm a lista e recebem o padrão.
    permission_terms: z
      .array(z.string().trim().min(1).max(60))
      .min(1)
      .max(40)
      .default(() => [...PERMISSION_TERMS]),
  })
  .strict();
export const configSchema = z
  .object({
    instructions: text,
    operation_instructions: z.record(z.string(), text),
    timeout_ms: z.number().int().min(1000).max(60000),
    rules: rulesSchema,
  })
  .strict();
export type HarnessConfig = z.output<typeof configSchema>;
export interface HarnessRevision {
  mode: HarnessMode;
  version: number;
  schema_version: 1;
  config: HarnessConfig;
  created_at: string | null;
  created_by: string | null;
}
export const requestSchema = z
  .object({
    mode: z.enum(MODES),
    operation: z.string().min(1).max(30),
    level: z.enum(LEVELS).default("pbi"),
    fields: z
      .record(z.string().max(40), z.string().max(6000))
      .refine((value) => Object.keys(value).length <= 10)
      .default({}),
    context: z
      .array(
        z
          .object({ id: z.string().uuid(), text: z.string().min(1).max(8000) })
          .strict(),
      )
      .max(10)
      .default([]),
  })
  .strict();
export type HarnessInput = z.infer<typeof requestSchema>;
export function defaultConfig(mode: HarnessMode): HarnessConfig {
  const instructions: Record<HarnessMode, string> = {
    levantamento:
      "Questione lacunas antes de sugerir conteúdo. Se a informação não foi fornecida, pergunte. Não invente regras, atores ou condições. Reconheça quando não houver lacunas relevantes.",
    consulta:
      "Responda somente a partir dos trechos do projeto fornecidos e cite seus identificadores. Sem evidência, informe: Informação não encontrada no acervo do projeto.",
    recomendacao:
      "Recomende apenas origens fornecidas como candidatas no contexto. Não force recomendações quando não houver relação demonstrável.",
  };
  const operations: Record<string, string> = {
    questionar:
      "Avalie exatamente as seis dimensões de cobertura. Questione ambiguidade e condições sem critério verificável, sem inventar lacunas.",
    padronizar:
      "Reorganize somente o conteúdo fornecido na estrutura do nível. Se faltar informação para uma proposta completa, retorne proposal null e perguntas objetivas.",
    cenarios:
      "Proponha cenários DADO / QUANDO / ENTÃO apenas com fundamento na história e nas regras do PBI, cada um com nome curto e tipo. Inclua ao menos um cenário de caminho principal. Se a história envolver permissão, inclua também ao menos um cenário de acesso não autorizado. Não repita cenários já salvos. Se faltar informação, faça perguntas.",
    responder:
      "Responda à pergunta e liste os IDs dos trechos efetivamente utilizados.",
    similares:
      "Liste somente candidatos pertinentes, com justificativa e ID de origem.",
  };
  return {
    instructions: instructions[mode],
    operation_instructions: Object.fromEntries(
      OPERATIONS[mode].map((op) => [op, operations[op]]),
    ),
    timeout_ms: 45000,
    rules: {
      vague_terms: ["adequado", "rápido", "intuitivo", "correto"],
      macro_detail_terms: ["clique", "botão", "borda", "placeholder"],
      implementation_terms: [
        "sql",
        "endpoint",
        "react",
        "docker",
        "tabela no banco",
      ],
      permission_terms: [...PERMISSION_TERMS],
    },
  };
}

const str = { type: "string", minLength: 1, maxLength: 12000 };
const array = (items: unknown) => ({ type: "array", items, maxItems: 30 });
const obj = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });
const questions = array(str);
export function outputSchema(
  operation: string,
  level: HarnessLevel,
): Record<string, unknown> {
  switch (operation) {
    case "questionar":
      return obj({
        questions: array(
          obj({
            dimension: { type: "string", enum: DIMENSIONS },
            question: str,
          }),
        ),
        summary: str,
      });
    case "padronizar": {
      const fields = Object.fromEntries(
        FIELDS[level].map((field) => [
          field,
          {
            type: "string",
            minLength: field === "regras_observacoes" ? 0 : 1,
            maxLength: maxLengthFor(field),
          },
        ]),
      );
      return obj({
        proposal: { anyOf: [obj(fields), { type: "null" }] },
        questions,
      });
    }
    case "cenarios":
      return obj({
        scenarios: array(
          obj({
            nome: { type: "string", minLength: 1, maxLength: 255 },
            tipo: { type: "string", enum: SCENARIO_TYPES },
            dado: str,
            quando: str,
            entao: str,
          }),
        ),
        questions,
      });
    case "responder":
      return obj({
        answer: str,
        sources: array({ type: "string", format: "uuid" }),
      });
    case "similares":
      return obj({
        items: array(
          obj({ source_id: { type: "string", format: "uuid" }, reason: str }),
        ),
      });
    default:
      throw new Error("Operação inválida");
  }
}
export function parseOutput(input: HarnessInput, value: unknown) {
  const questions = z.array(text).max(30);
  const proposal = z
    .object(
      Object.fromEntries(
        FIELDS[input.level].map((field) => [
          field,
          z
            .string()
            .trim()
            .min(field === "regras_observacoes" ? 0 : 1)
            .max(maxLengthFor(field)),
        ]),
      ),
    )
    .strict()
    .nullable();
  const schemas: Record<string, z.ZodTypeAny> = {
    questionar: z
      .object({
        questions: z
          .array(
            z
              .object({ dimension: z.enum(DIMENSIONS), question: text })
              .strict(),
          )
          .max(30),
        summary: text,
      })
      .strict(),
    padronizar: z.object({ proposal, questions }).strict(),
    cenarios: z
      .object({
        scenarios: z
          .array(
            z
              .object({
                nome: z.string().trim().min(1).max(255),
                tipo: z.enum(SCENARIO_TYPES),
                dado: text,
                quando: text,
                entao: text,
              })
              .strict(),
          )
          .max(30),
        questions,
      })
      .strict(),
    responder: z
      .object({ answer: text, sources: z.array(z.string().uuid()).max(30) })
      .strict(),
    similares: z
      .object({
        items: z
          .array(
            z.object({ source_id: z.string().uuid(), reason: text }).strict(),
          )
          .max(30),
      })
      .strict(),
  };
  return schemas[input.operation].parse(value);
}
