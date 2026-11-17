import { z } from "zod";
import { NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";
import { validateTextFields } from "../../shared/text-validation.js";
import { DevelopersRepository } from "./developers.repository.js";
import {
  ALLOWED_SENIORITIES,
  type CreateDeveloperInput,
  type Developer,
  type DeveloperConsolidatedProfile,
  type DevelopersOverview,
  type LinkablePlatformUser,
  type UpdateDeveloperInput,
} from "./developers.types.js";

const FORBIDDEN_PERSONAL_DATA_KEYS = new Set([
  "cpf",
  "rg",
  "cnh",
  "passaporte",
  "documento_pessoal",
  "telefone",
  "celular",
  "whatsapp",
  "endereco",
  "logradouro",
  "cep",
  "bairro",
  "cidade_residencia",
  "data_nascimento",
  "nascimento",
  "idade",
  "estado_civil",
  "genero",
  "religiao",
  "filiacao",
  "salario",
  "remuneracao",
  "pretensao_salarial",
  "conta_bancaria",
  "chave_pix",
  "email_pessoal",
  "email",
  "redes_sociais",
]);

const SENIORITY_MAP: Record<string, (typeof ALLOWED_SENIORITIES)[number]> = {
  junior: "Junior",
  "júnior": "Junior",
  jr: "Junior",
  pleno: "Pleno",
  pl: "Pleno",
  senior: "Senior",
  "sênior": "Senior",
  sr: "Senior",
  especialista: "Especialista",
  staff: "Especialista",
  "tech lead": "Tech Lead",
  techlead: "Tech Lead",
};

// Detecta CPF formatado (000.000.000-00) ou rótulos explícitos de documentos/dados pessoais no texto livre
const PERSONAL_DATA_IN_TEXT_REGEX =
  /(?:\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b(?:cpf|rg|cnh|data\s+de\s+nascimento|endere[cç]o\s+residencial|sal[aá]rio|remunera[cç][aã]o)\s*[:=-])/i;

function normalizeSeniority(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = SENIORITY_MAP[trimmed.toLowerCase()];
  if (!normalized) {
    throw new ValidationError(
      `Senioridade inválida. Valores permitidos: ${ALLOWED_SENIORITIES.join(", ")}.`,
    );
  }
  return normalized;
}

function assertNoPersonalDataInPayload(input: unknown): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("Dados do perfil profissional inválidos.");
  }

  const keys = Object.keys(input as Record<string, unknown>);
  const forbiddenKeys = keys.filter(
    (key) =>
      FORBIDDEN_PERSONAL_DATA_KEYS.has(key.toLowerCase()) ||
      !["nome", "usuario_id", "senioridade", "bio"].includes(key),
  );

  if (forbiddenKeys.length > 0) {
    throw new ValidationError(
      "O registro deve se restringir a informações de natureza profissional. Dados pessoais fora do propósito não são permitidos.",
      {
        forbidden_fields: forbiddenKeys,
        purpose_limitation: "LGPD_RNF_09",
      },
    );
  }
}

function assertNoPersonalDataInText(fieldLabel: string, value: string | null | undefined): void {
  if (!value) return;
  if (PERSONAL_DATA_IN_TEXT_REGEX.test(value)) {
    throw new ValidationError(
      `O campo ${fieldLabel} contém dados pessoais fora do propósito profissional (ex.: documentos pessoais, endereço ou salário).`,
      { field: fieldLabel, purpose_limitation: "LGPD_RNF_09" },
    );
  }
}

const developerPayloadSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(2, "O nome profissional deve ter pelo menos 2 caracteres.")
      .max(255, "O nome profissional deve ter no máximo 255 caracteres.")
      .optional(),
    usuario_id: z
      .string()
      .uuid("O identificador do usuário vinculado deve ser um UUID válido.")
      .nullable()
      .optional(),
    senioridade: z
      .string()
      .trim()
      .max(50, "A senioridade deve ter no máximo 50 caracteres.")
      .nullable()
      .optional(),
    bio: z
      .string()
      .trim()
      .max(2000, "O resumo profissional deve ter no máximo 2000 caracteres.")
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine(validateTextFields);

type DevelopersRepositoryPort = Pick<
  DevelopersRepository,
  "listDevelopers" | "listTechnologies" | "listCompetencies"
> &
  Partial<
    Pick<
      DevelopersRepository,
      "getConsolidatedProfile" | "listLinkableUsers" | "create" | "update"
    >
  >;

export class DevelopersService {
  constructor(
    private readonly repository: DevelopersRepositoryPort = new DevelopersRepository(),
  ) {}

  async overview(viewerUserId?: string): Promise<DevelopersOverview> {
    const [desenvolvedores, tecnologias, competencias] = await Promise.all([
      this.repository.listDevelopers(viewerUserId),
      this.repository.listTechnologies(),
      this.repository.listCompetencies(),
    ]);
    return { desenvolvedores, tecnologias, competencias };
  }

  async listLinkableUsers(): Promise<{ items: LinkablePlatformUser[] }> {
    if (!this.repository.listLinkableUsers) {
      throw new Error("listLinkableUsers não configurado.");
    }
    return { items: await this.repository.listLinkableUsers() };
  }

  async getProfile(developerId: string, viewerUserId: string): Promise<DeveloperConsolidatedProfile> {
    validateUuid(developerId, "ID do perfil profissional");
    if (!this.repository.getConsolidatedProfile) {
      throw new Error("getConsolidatedProfile não configurado.");
    }
    const profile = await this.repository.getConsolidatedProfile(developerId, viewerUserId);
    if (!profile) {
      throw new NotFoundError("Perfil profissional não encontrado.");
    }
    return profile;
  }

  async createProfile(input: unknown, actorUserId: string): Promise<Developer> {
    assertNoPersonalDataInPayload(input);

    const parsed = developerPayloadSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ValidationError(
        issue?.message ?? "Dados inválidos para criação do perfil profissional.",
        parsed.error.flatten(),
      );
    }

    const { nome, usuario_id, senioridade, bio } = parsed.data;
    if (!nome && !usuario_id) {
      throw new ValidationError(
        "Informe o nome profissional ou selecione um usuário da plataforma para vincular ao perfil.",
      );
    }

    assertNoPersonalDataInText("nome", nome);
    assertNoPersonalDataInText("resumo profissional", bio);

    const normalizedSeniority = normalizeSeniority(senioridade);

    if (!this.repository.create) {
      throw new Error("create não configurado.");
    }

    const cleanInput: CreateDeveloperInput = {
      nome: nome?.trim(),
      usuario_id: usuario_id ?? null,
      senioridade: normalizedSeniority ?? null,
      bio: bio?.trim() || null,
    };

    return await this.repository.create(cleanInput, actorUserId);
  }

  async updateProfile(
    developerId: string,
    input: unknown,
    actorUserId: string,
  ): Promise<Developer> {
    validateUuid(developerId, "ID do perfil profissional");
    assertNoPersonalDataInPayload(input);

    const rawObj = input as Record<string, unknown>;
    if (Object.keys(rawObj).length === 0) {
      throw new ValidationError("Informe ao menos um campo profissional para atualizar.");
    }

    const parsed = developerPayloadSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ValidationError(
        issue?.message ?? "Dados inválidos para atualização do perfil profissional.",
        parsed.error.flatten(),
      );
    }

    const { nome, usuario_id, senioridade, bio } = parsed.data;
    assertNoPersonalDataInText("nome", nome);
    assertNoPersonalDataInText("resumo profissional", bio);

    const normalizedSeniority = normalizeSeniority(senioridade);

    if (!this.repository.update) {
      throw new Error("update não configurado.");
    }

    const cleanInput: UpdateDeveloperInput = {
      ...(nome !== undefined ? { nome: nome.trim() } : {}),
      ...(usuario_id !== undefined ? { usuario_id } : {}),
      ...(senioridade !== undefined ? { senioridade: normalizedSeniority ?? null } : {}),
      ...(bio !== undefined ? { bio: bio?.trim() || null } : {}),
    };

    return await this.repository.update(developerId, cleanInput, actorUserId);
  }
}
