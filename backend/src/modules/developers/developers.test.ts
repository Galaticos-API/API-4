import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { parse } from "yaml";
import { AppError } from "../../shared/errors.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import type { UserRole } from "../auth/auth.types.js";
import { DevelopersController } from "./developers.controller.js";
import { createDevelopersRouter } from "./developers.routes.js";
import { DevelopersService } from "./developers.service.js";
import { DevelopersRepository } from "./developers.repository.js";
import type {
  CreateDeveloperInput,
  Developer,
  DeveloperConsolidatedProfile,
  LinkablePlatformUser,
  UpdateDeveloperInput,
} from "./developers.types.js";

const DEV_1_ID = "30000000-0000-4000-8000-000000000001";
const USER_DEV_ID = "10000000-0000-4000-8000-000000000003";
const USER_UNLINKED_ID = "10000000-0000-4000-8000-000000000004";
const PROJECT_1_ID = "40000000-0000-4000-8000-000000000001";

function createFakeDevelopersStore() {
  const users = new Map<string, { id: string; nome: string; role: UserRole }>([
    [USER_DEV_ID, { id: USER_DEV_ID, nome: "Dev Rafael Matesco", role: "dev" }],
    [USER_UNLINKED_ID, { id: USER_UNLINKED_ID, nome: "Dev Giovanna", role: "dev" }],
  ]);

  const developers = new Map<string, Developer>([
    [
      DEV_1_ID,
      {
        id: DEV_1_ID,
        nome: "Dev Rafael Matesco",
        senioridade: "Senior",
        bio: "Engenheiro de Software com foco em Node.js e PostgreSQL.",
        usuario_id: USER_DEV_ID,
        usuario_nome: "Dev Rafael Matesco",
        role: "dev",
        competencias_count: 2,
        alocacoes_count: 1,
        created_at: "2026-09-10T12:00:00.000Z",
        updated_at: "2026-09-10T12:00:00.000Z",
      },
    ],
  ]);

  let seq = 2;

  return {
    async listDevelopers(): Promise<Developer[]> {
      return [...developers.values()];
    },
    async listTechnologies() {
      return [
        { id: "20000000-0000-4000-8000-000000000001", nome: "TypeScript", categoria: "backend" },
        { id: "20000000-0000-4000-8000-000000000003", nome: "PostgreSQL", categoria: "database" },
      ];
    },
    async listCompetencies() {
      return [
        {
          id: "31000000-0000-4000-8000-000000000001",
          desenvolvedor_id: DEV_1_ID,
          tecnologia_id: "20000000-0000-4000-8000-000000000001",
          nivel: "especialista",
          evidencia: "Arquitetura de microsserviços em TypeScript",
          tecnologia_nome: "TypeScript",
          tecnologia_categoria: "backend",
        },
      ];
    },
    async listLinkableUsers(): Promise<LinkablePlatformUser[]> {
      return [...users.values()].map((u) => {
        const linked = [...developers.values()].find((d) => d.usuario_id === u.id);
        return {
          id: u.id,
          nome: u.nome,
          role: u.role,
          perfil_id: linked?.id ?? null,
        };
      });
    },
    async getConsolidatedProfile(id: string): Promise<DeveloperConsolidatedProfile | null> {
      const dev = developers.get(id);
      if (!dev) return null;
      return {
        id: dev.id,
        nome: dev.nome,
        senioridade: dev.senioridade,
        bio: dev.bio,
        usuario_id: dev.usuario_id,
        usuario_nome: dev.usuario_nome,
        role: dev.role,
        created_at: dev.created_at,
        updated_at: dev.updated_at,
        competencias: [
          {
            id: "31000000-0000-4000-8000-000000000001",
            desenvolvedor_id: dev.id,
            tecnologia_id: "20000000-0000-4000-8000-000000000001",
            nivel: "especialista",
            evidencia: "Arquitetura de microsserviços em TypeScript",
            tecnologia_nome: "TypeScript",
            tecnologia_categoria: "backend",
          },
        ],
        alocacoes: [
          {
            id: "32000000-0000-4000-8000-000000000001",
            desenvolvedor_id: dev.id,
            projeto_id: PROJECT_1_ID,
            projeto_nome: "Plataforma Sinapse",
            projeto_status: "ativo",
            papel: "Tech Lead Backend",
            data_inicio: "2026-09-01T00:00:00.000Z",
            data_fim: null,
            em_andamento: true,
          },
        ],
        historico_consolidado: [
          {
            projeto_id: PROJECT_1_ID,
            projeto_nome: "Plataforma Sinapse",
            projeto_descricao: "Memória institucional inteligente da fábrica de software.",
            projeto_status: "ativo",
            papeis: ["Tech Lead Backend"],
            primeira_alocacao: "2026-09-01T00:00:00.000Z",
            ultima_alocacao: null,
            em_andamento: true,
            tecnologias: [
              { id: "20000000-0000-4000-8000-000000000001", nome: "TypeScript", categoria: "backend" },
            ],
          },
        ],
      };
    },
    async create(input: CreateDeveloperInput): Promise<Developer> {
      if (input.usuario_id) {
        const existing = [...developers.values()].find((d) => d.usuario_id === input.usuario_id);
        if (existing) {
          throw new AppError(
            "Já existe um perfil profissional vinculado a este usuário.",
            409,
            "DEVELOPER_PROFILE_EXISTS",
            {
              existing_profile: {
                id: existing.id,
                nome: existing.nome,
                senioridade: existing.senioridade,
                bio: existing.bio,
                usuario_id: existing.usuario_id,
              },
            },
          );
        }
      }

      const linkedUser = input.usuario_id ? users.get(input.usuario_id) ?? null : null;
      const newId = `30000000-0000-4000-8000-00000000000${seq++}`;
      const now = new Date().toISOString();
      const created: Developer = {
        id: newId,
        nome: input.nome?.trim() || linkedUser?.nome || "Profissional",
        senioridade: input.senioridade ?? null,
        bio: input.bio ?? null,
        usuario_id: input.usuario_id ?? null,
        usuario_nome: linkedUser?.nome ?? null,
        role: linkedUser?.role ?? null,
        competencias_count: 0,
        alocacoes_count: 0,
        created_at: now,
        updated_at: now,
      };
      developers.set(newId, created);
      return created;
    },
    async update(id: string, input: UpdateDeveloperInput): Promise<Developer> {
      const current = developers.get(id);
      if (!current) {
        throw new AppError("Perfil profissional não encontrado.", 404, "NOT_FOUND");
      }
      if (input.usuario_id) {
        const existing = [...developers.values()].find(
          (d) => d.usuario_id === input.usuario_id && d.id !== id,
        );
        if (existing) {
          throw new AppError(
            "Já existe um perfil profissional vinculado a este usuário.",
            409,
            "DEVELOPER_PROFILE_EXISTS",
            {
              existing_profile: {
                id: existing.id,
                nome: existing.nome,
                senioridade: existing.senioridade,
                bio: existing.bio,
                usuario_id: existing.usuario_id,
              },
            },
          );
        }
      }

      const nextUserId =
        input.usuario_id !== undefined ? input.usuario_id : current.usuario_id;
      const linkedUser = nextUserId ? users.get(nextUserId) ?? null : null;

      const updated: Developer = {
        ...current,
        nome: input.nome !== undefined ? input.nome : current.nome,
        senioridade: input.senioridade !== undefined ? input.senioridade : current.senioridade,
        bio: input.bio !== undefined ? input.bio : current.bio,
        usuario_id: nextUserId,
        usuario_nome: linkedUser?.nome ?? null,
        role: linkedUser?.role ?? null,
        updated_at: new Date().toISOString(),
      };
      developers.set(id, updated);
      return updated;
    },
  };
}

test("S3-08 / PBI-05.1.1: cria perfil profissional sem vínculo e vincula usuário sem duplicidade", async () => {
  const store = createFakeDevelopersStore();
  const service = new DevelopersService(store);

  // Cenário 1: Criar perfil com nome, senioridade e resumo profissional
  const createdStandalone = await service.createProfile(
    {
      nome: "Heitor Souza",
      senioridade: "Pleno",
      bio: "Desenvolvedor backend especializado em integrações financeiras e APIs REST.",
    },
    "10000000-0000-4000-8000-000000000001",
  );

  assert.equal(createdStandalone.nome, "Heitor Souza");
  assert.equal(createdStandalone.senioridade, "Pleno");
  assert.equal(createdStandalone.usuario_id, null);

  // Cenário 2: Vincular perfil a um usuário da plataforma
  const linked = await service.updateProfile(
    createdStandalone.id,
    { usuario_id: USER_UNLINKED_ID },
    "10000000-0000-4000-8000-000000000001",
  );
  assert.equal(linked.usuario_id, USER_UNLINKED_ID);
  assert.equal(linked.usuario_nome, "Dev Giovanna");

  // Cenário 3: Impedir duplicidade para o mesmo usuário e indicar o perfil existente
  await assert.rejects(
    async () => {
      await service.createProfile(
        {
          nome: "Perfil Duplicado",
          senioridade: "Senior",
          usuario_id: USER_DEV_ID,
        },
        "10000000-0000-4000-8000-000000000001",
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, "DEVELOPER_PROFILE_EXISTS");
      const details = err.details as { existing_profile?: { id: string; nome: string } };
      assert.equal(details?.existing_profile?.id, DEV_1_ID);
      assert.equal(details?.existing_profile?.nome, "Dev Rafael Matesco");
      return true;
    },
  );
});

test("S3-08 / RNF-09 (Security by Design): rejeita dados pessoais fora do propósito profissional", async () => {
  const store = createFakeDevelopersStore();
  const service = new DevelopersService(store);

  const personalPayloads = [
    { nome: "Profissional A", cpf: "123.456.789-00" },
    { nome: "Profissional B", telefone: "(11) 99999-9999" },
    { nome: "Profissional C", endereco: "Rua das Flores, 123" },
    { nome: "Profissional D", data_nascimento: "1995-05-10" },
    { nome: "Profissional E", salario: 12000 },
    { nome: "Profissional F", email: "pessoal@gmail.com" },
    { nome: "Profissional G", campo_extra: "valor" },
  ];

  for (const payload of personalPayloads) {
    await assert.rejects(
      () => service.createProfile(payload, "10000000-0000-4000-8000-000000000001"),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, "VALIDATION_ERROR");
        return true;
      },
    );
  }

  // Também rejeita CPF ou dados pessoais embutidos no texto livre do resumo profissional
  for (const forbiddenBio of [
    "Engenheiro de software. CPF: 123.456.789-00",
    "Arquiteto backend (123.456.789-00)",
    "Desenvolvedor pleno. Salário: R$ 10.000",
    "Contato pessoal: pessoa@gmail.com",
    "Engenheiro com telefone (11) 98765-4321",
    "Documento informado: 12345678900",
    "Mora na Rua das Flores, 123, Centro",
    "Contato profissional: ana@pro4tech.com.br",
    "Nascido em 12/03/1990",
    "Data de nascimento: 1990-03-12",
    "Resumo com caractere nulo\u0000inválido",
  ]) {
    await assert.rejects(
      () =>
        service.createProfile(
          { nome: "Profissional Seguro", senioridade: "Pleno", bio: forbiddenBio },
          "10000000-0000-4000-8000-000000000001",
        ),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 400);
        return true;
      },
    );
  }

  const corporateBio = "Engenheiro de software com contato profissional pessoa@empresa.com";
  await assert.rejects(
    () => service.createProfile(
      { nome: "Profissional Corporativo", senioridade: "Pleno", bio: corporateBio },
      "10000000-0000-4000-8000-000000000001",
    ),
    (err: unknown) => err instanceof AppError && err.statusCode === 400,
  );

  await assert.rejects(
    () => service.createProfile(
      { nome: "Profissional Rotulado", senioridade: "Pleno", bio: "E-mail pessoal: pessoa@empresa.com" },
      "10000000-0000-4000-8000-000000000001",
    ),
    (err: unknown) => err instanceof AppError && err.statusCode === 400,
  );
});

test("S3-08: create e update bloqueiam PII em texto livre antes da persistência", async () => {
  const store = createFakeDevelopersStore();
  let createCalls = 0;
  let updateCalls = 0;
  const repository = {
    ...store,
    async create(input: CreateDeveloperInput) {
      createCalls += 1;
      return store.create(input);
    },
    async update(id: string, input: UpdateDeveloperInput) {
      updateCalls += 1;
      return store.update(id, input);
    },
  };
  const service = new DevelopersService(repository);
  const rejectedText = [
    "Contato: pessoal@gmail.com",
    "Contato profissional: pessoa@empresa.com",
    "Nascido(a) em 12/03/1990",
    "Data de nascimento: 1990-03-12",
    "CPF: 123.456.789-00",
    "Telefone: (11) 99999-9999",
    "Mora na Rua das Flores, 123, Centro",
    "Resumo com caractere nulo\u0000inválido",
  ];

  for (const bio of rejectedText) {
    for (const operation of ["create", "update"] as const) {
      await assert.rejects(
        operation === "create"
          ? service.createProfile({ nome: "Profissional", bio }, USER_DEV_ID)
          : service.updateProfile(DEV_1_ID, { bio }, USER_DEV_ID),
        (err: unknown) => err instanceof AppError && err.statusCode === 400 && err.code === "VALIDATION_ERROR",
        `${operation} deveria rejeitar ${bio}`,
      );
    }
  }
  assert.equal(createCalls, 0, "nenhum perfil rejeitado chega a create do repositório");
  assert.equal(updateCalls, 0, "nenhuma atualização rejeitada chega a update do repositório");

  const professionalBio = "Tech Lead backend, especialista em Node.js, certificado AWS; experiência desde 2021 e projeto entregue em 2022-06-15.";
  const created = await service.createProfile(
    { nome: "Profissional Seguro", senioridade: "Senior", bio: professionalBio },
    USER_DEV_ID,
  );
  assert.equal(created.bio, professionalBio);
  const updated = await service.updateProfile(DEV_1_ID, { bio: "Engenheiro backend com experiência em PostgreSQL." }, USER_DEV_ID);
  assert.equal(updated.bio, "Engenheiro backend com experiência em PostgreSQL.");
  assert.equal(createCalls, 1);
  assert.equal(updateCalls, 1);
});

test("S3-08: unique violation em create consulta perfil após restaurar estado da transação", async () => {
  const queryLog: string[] = [];
  let transactionAborted = false;
  const existing = {
    id: DEV_1_ID,
    nome: "Dev Rafael Matesco",
    senioridade: "Senior",
    bio: "Engenheiro de Software",
    usuario_id: USER_DEV_ID,
  };
  const client = {
    async query(sql: string) {
      const normalized = sql.trim().toUpperCase();
      queryLog.push(normalized);
      if (transactionAborted && normalized !== "ROLLBACK TO SAVEPOINT DEVELOPER_INSERT") {
        throw new Error("current transaction is aborted");
      }
      if (normalized === "BEGIN") return { rows: [] };
      if (normalized.startsWith("SELECT ID, NOME, ATIVO FROM USUARIO")) {
        return { rows: [{ id: USER_DEV_ID, nome: "Dev Rafael Matesco", ativo: true }] };
      }
      if (normalized.startsWith("SELECT") && normalized.includes("FROM DESENVOLVEDOR D")) {
        if (normalized.includes("WHERE D.USUARIO_ID = $1")) {
          return queryLog.some((entry) => entry === "ROLLBACK TO SAVEPOINT DEVELOPER_INSERT")
            ? { rows: [existing] }
            : { rows: [] };
        }
        return { rows: [existing] };
      }
      if (normalized.startsWith("INSERT INTO DESENVOLVEDOR")) {
        transactionAborted = true;
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      }
      if (normalized === "ROLLBACK TO SAVEPOINT DEVELOPER_INSERT") {
        transactionAborted = false;
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const db = {
    async connect() { return client; },
    async query() { throw new Error("unexpected pool query"); },
  };
  const repository = new DevelopersRepository(db as never);

  await assert.rejects(
    () => repository.create({ nome: "Perfil concorrente", usuario_id: USER_DEV_ID }, "10000000-0000-4000-8000-000000000001"),
    (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 409, queryLog.join(" | "));
      assert.equal(err.code, "DEVELOPER_PROFILE_EXISTS");
      assert.equal((err.details as { existing_profile?: { id: string } }).existing_profile?.id, DEV_1_ID);
      return true;
    },
  );

  assert.ok(queryLog.includes("ROLLBACK TO SAVEPOINT DEVELOPER_INSERT"), queryLog.join(" | "));
  assert.equal(transactionAborted, false);
});

test("S3-08 / PBI-05.1.4: rotas HTTP entregam perfil consolidado para a equipe e restringem escrita a PO/Admin", async () => {
  const store = createFakeDevelopersStore();
  const service = new DevelopersService(store);
  const controller = new DevelopersController(service);

  let currentRole: UserRole = "dev";
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/developers",
    createDevelopersRouter(controller, (req, _res, next) => {
      req.auth = {
        id: USER_DEV_ID,
        nome: "Usuário Teste",
        email: "teste@sinapse.local",
        role: currentRole,
      };
      next();
    }),
  );
  app.use(errorHandler);

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}/api/v1/developers`;

  try {
    // 1. Membro da equipe (dev) pode consultar o perfil consolidado (PBI-05.1.4)
    const profileRes = await fetch(`${baseUrl}/${DEV_1_ID}`);
    assert.equal(profileRes.status, 200);
    const profileBody = (await profileRes.json()) as DeveloperConsolidatedProfile;
    assert.equal(profileBody.id, DEV_1_ID);
    assert.equal(profileBody.nome, "Dev Rafael Matesco");
    assert.equal(profileBody.competencias.length, 1);
    assert.equal(profileBody.alocacoes.length, 1);
    assert.equal(profileBody.historico_consolidado.length, 1);
    assert.equal(profileBody.historico_consolidado[0].projeto_id, PROJECT_1_ID);
    // Garante ausência de campos de contato pessoal / credenciais
    assert.equal("email" in profileBody, false);
    assert.equal("senha_hash" in profileBody, false);

    // 2. Membro com papel 'dev' não pode criar nem editar perfis (403 Forbidden)
    const devCreateRes = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: "Tentativa Dev", senioridade: "Junior" }),
    });
    assert.equal(devCreateRes.status, 403);

    // 3. Gestor ('po') cria perfil e recebe 409 com existing_profile ao duplicar vínculo
    currentRole = "po";
    const poCreateRes = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: "Novo Integrante",
        senioridade: "Senior",
        bio: "Especialista em observabilidade e testes automatizados.",
      }),
    });
    assert.equal(poCreateRes.status, 201);

    const duplicateRes = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: "Outro Perfil",
        senioridade: "Pleno",
        usuario_id: USER_DEV_ID,
      }),
    });
    assert.equal(duplicateRes.status, 409);
    const duplicateBody = (await duplicateRes.json()) as {
      code: string;
      details?: { existing_profile?: { id: string } };
    };
    assert.equal(duplicateBody.code, "DEVELOPER_PROFILE_EXISTS");
    assert.equal(duplicateBody.details?.existing_profile?.id, DEV_1_ID);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("S3-08: contrato OpenAPI documenta rotas e schemas de perfis profissionais", () => {
  const openapiPath = existsSync(resolve(process.cwd(), "docs/api/openapi.yaml"))
    ? resolve(process.cwd(), "docs/api/openapi.yaml")
    : resolve(process.cwd(), "../docs/api/openapi.yaml");
  const raw = readFileSync(openapiPath, "utf8");
  const doc = parse(raw) as {
    paths: Record<string, Record<string, unknown>>;
    components: { schemas: Record<string, unknown> };
  };

  assert.ok(doc.paths["/api/v1/developers"]?.get, "GET /api/v1/developers documentado");
  assert.ok(doc.paths["/api/v1/developers"]?.post, "POST /api/v1/developers documentado");
  assert.ok(doc.paths["/api/v1/developers/users"]?.get, "GET /api/v1/developers/users documentado");
  assert.ok(doc.paths["/api/v1/developers/{id}"]?.get, "GET /api/v1/developers/{id} documentado");
  assert.ok(doc.paths["/api/v1/developers/{id}"]?.patch, "PATCH /api/v1/developers/{id} documentado");

  for (const schemaName of [
    "CreateDeveloperRequest",
    "UpdateDeveloperRequest",
    "LinkablePlatformUser",
    "DeveloperProfile",
    "DeveloperConsolidatedProfile",
    "DevelopersOverview",
  ]) {
    assert.ok(doc.components.schemas[schemaName], `Schema ${schemaName} presente no OpenAPI`);
  }
});
