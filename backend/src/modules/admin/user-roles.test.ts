import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import express, { type RequestHandler, type Router } from "express";
import { parse } from "yaml";
import { errorHandler } from "../../middleware/errorHandler.js";
import type { SessionWithUser, UserRole } from "../auth/auth.types.js";
import { SessionService } from "../auth/session.service.js";
import { pbisRouter } from "../pbis/pbis.routes.js";
import { epicsRouter } from "../epics/epics.routes.js";
import { featuresRouter } from "../features/features.routes.js";
import { criteriaRouter } from "../criteria/criteria.routes.js";
import { AdminController } from "./admin.controller.js";
import { createAdminRouter } from "./admin.routes.js";
import {
  LAST_ADMIN_MESSAGE,
  ROLE_CHANGE_AUDIT_ACTION,
  ROLE_CHANGE_LOCK_KEY,
  UserRolesRepository,
  type PlatformUserRole,
} from "./user-roles.repository.js";
import { NEXT_ACCESS_MESSAGE, UserRolesController, UserRolesService } from "./user-roles.service.js";

const ADMIN_A = "10000000-0000-4000-8000-0000000000a1";
const ADMIN_B = "10000000-0000-4000-8000-0000000000a2";
const PO_ID = "10000000-0000-4000-8000-0000000000b1";
const DEV_ID = "10000000-0000-4000-8000-0000000000c1";

interface FakeUser { id: string; nome: string; email: string; role: UserRole; ativo: boolean }
interface FakeAudit { usuario_id: string | null; entidade_tipo: string; entidade_id: string; acao: string; justificativa: string | null; dados_json: Record<string, unknown> }

/**
 * Pool em memória que reproduz o comportamento relevante do PostgreSQL:
 * transação com ROLLBACK, lock consultivo transacional (fila exclusiva liberada
 * no COMMIT/ROLLBACK) e as consultas do repositório de perfis.
 */
function createFakePool(seed: FakeUser[]) {
  const users = new Map(seed.map((user) => [user.id, { ...user }]));
  const audits: FakeAudit[] = [];
  const log: string[] = [];
  let lockTail: Promise<void> = Promise.resolve();

  function userRow(user: FakeUser) {
    const last = [...audits].reverse().find((a) => a.entidade_tipo === "usuario" && a.entidade_id === user.id && a.acao === ROLE_CHANGE_AUDIT_ACTION);
    return {
      ...user,
      created_at: "2026-09-01T12:00:00.000Z",
      papel_alterado_em: last ? "2026-11-19T12:00:00.000Z" : null,
      papel_alterado_por: last?.usuario_id ?? null,
      papel_alterado_por_nome: last?.usuario_id ? users.get(last.usuario_id)?.nome ?? null : null,
    };
  }

  const pool = {
    users,
    audits,
    log,
    async query(sql: string) {
      if (sql.includes("FROM usuario u")) {
        return { rows: [...users.values()].sort((a, b) => a.nome.localeCompare(b.nome)).map(userRow), rowCount: users.size };
      }
      throw new Error(`Consulta fora da transação não esperada: ${sql}`);
    },
    async connect() {
      // Desfaz apenas o que esta transação escreveu, como no PostgreSQL.
      const undo: FakeUser[] = [];
      const ownAudits: FakeAudit[] = [];
      let releaseLock: (() => void) | null = null;
      const release = () => { releaseLock?.(); releaseLock = null; };
      return {
        release() {},
        async query(sql: string, params: unknown[] = []) {
          const text = sql.trim();
          log.push(text.split("\n")[0]);
          if (text === "BEGIN") return { rows: [], rowCount: 0 };
          if (text === "COMMIT") { release(); return { rows: [], rowCount: 0 }; }
          if (text === "ROLLBACK") {
            undo.reverse().forEach((user) => users.set(user.id, user));
            ownAudits.forEach((entry) => audits.splice(audits.indexOf(entry), 1));
            release();
            return { rows: [], rowCount: 0 };
          }
          if (text.startsWith("SELECT pg_advisory_xact_lock")) {
            assert.equal(params[0], ROLE_CHANGE_LOCK_KEY);
            const previous = lockTail;
            let unlock!: () => void;
            lockTail = new Promise<void>((done) => { unlock = done; });
            await previous;
            releaseLock = unlock;
            return { rows: [{}], rowCount: 1 };
          }
          if (text.startsWith("SELECT id, role, ativo FROM usuario WHERE id = $1 FOR UPDATE")) {
            const user = users.get(String(params[0]));
            // Cede a vez para que pedidos concorrentes tentem intercalar.
            await new Promise((done) => setImmediate(done));
            return { rows: user ? [{ id: user.id, role: user.role, ativo: user.ativo }] : [], rowCount: user ? 1 : 0 };
          }
          if (text.startsWith("SELECT COUNT(*)::int AS total FROM usuario WHERE role = 'admin'")) {
            const total = [...users.values()].filter((u) => u.role === "admin" && u.ativo && u.id !== params[0]).length;
            // Sem o lock consultivo, os dois pedidos leriam a contagem antes de qualquer UPDATE.
            await new Promise((done) => setImmediate(done));
            return { rows: [{ total }], rowCount: 1 };
          }
          if (text.startsWith("UPDATE usuario SET role")) {
            const user = users.get(String(params[0]))!;
            undo.push({ ...user });
            users.set(user.id, { ...user, role: params[1] as UserRole });
            return { rows: [], rowCount: 1 };
          }
          if (text.startsWith("INSERT INTO auditoria")) {
            const [usuario_id, entidade_tipo, entidade_id, acao, justificativa, dados] = params as [string, string, string, string, string | null, string];
            const entry = { usuario_id, entidade_tipo, entidade_id, acao, justificativa, dados_json: JSON.parse(dados) };
            audits.push(entry);
            ownAudits.push(entry);
            return { rows: [], rowCount: 1 };
          }
          if (text.includes("FROM usuario u") && text.includes("WHERE u.id = $1")) {
            const user = users.get(String(params[0]));
            return { rows: user ? [userRow(user)] : [], rowCount: user ? 1 : 0 };
          }
          throw new Error(`Consulta não esperada: ${text}`);
        },
      };
    },
  };
  return pool;
}

const seedUsers = (): FakeUser[] => [
  { id: ADMIN_A, nome: "Ana Admin", email: "ana@sinapse.local", role: "admin", ativo: true },
  { id: PO_ID, nome: "Paulo PO", email: "paulo@sinapse.local", role: "po", ativo: true },
  { id: DEV_ID, nome: "Davi Dev", email: "davi@sinapse.local", role: "dev", ativo: true },
];

test("S3-13 / PBI-06.2.1 cenário 1: atribui perfil e registra autor, data e papéis na auditoria da mesma transação", async () => {
  const pool = createFakePool(seedUsers());
  const service = new UserRolesService(new UserRolesRepository(pool as never));

  const result = await service.changeRole(DEV_ID, { role: "po", justificativa: "Assumiu o produto" }, ADMIN_A);

  assert.equal(result.alterado, true);
  assert.equal(result.papel_anterior, "dev");
  assert.equal(result.usuario.role, "po");
  assert.equal(result.message, NEXT_ACCESS_MESSAGE);
  assert.equal(result.usuario.papel_alterado_por, ADMIN_A);
  assert.equal(result.usuario.papel_alterado_por_nome, "Ana Admin");
  assert.ok(result.usuario.papel_alterado_em);
  assert.deepEqual(pool.audits, [{
    usuario_id: ADMIN_A,
    entidade_tipo: "usuario",
    entidade_id: DEV_ID,
    acao: ROLE_CHANGE_AUDIT_ACTION,
    justificativa: "Assumiu o produto",
    dados_json: { papel_anterior: "dev", papel_novo: "po" },
  }]);
  const order = pool.log.filter((line) => /^(BEGIN|COMMIT|SELECT pg_advisory|UPDATE usuario|INSERT INTO auditoria)/.test(line));
  assert.deepEqual(order.map((line) => line.split(" ")[0] + (line.includes("advisory") ? ":lock" : "")), ["BEGIN", "SELECT:lock", "UPDATE", "INSERT", "COMMIT"]);
});

test("S3-13: manter o mesmo perfil não grava auditoria nem altera o usuário", async () => {
  const pool = createFakePool(seedUsers());
  const service = new UserRolesService(new UserRolesRepository(pool as never));
  const result = await service.changeRole(PO_ID, { role: "po" }, ADMIN_A);
  assert.equal(result.alterado, false);
  assert.equal(pool.audits.length, 0);
});

test("S3-13: valida perfil, UUID e campos extras antes de abrir transação", async () => {
  const pool = createFakePool(seedUsers());
  const service = new UserRolesService(new UserRolesRepository(pool as never));
  await assert.rejects(service.changeRole(DEV_ID, { role: "gerente" }, ADMIN_A), /Perfil de acesso inválido/);
  await assert.rejects(service.changeRole(DEV_ID, {}, ADMIN_A), /Perfil de acesso inválido/);
  await assert.rejects(service.changeRole("nao-uuid", { role: "po" }, ADMIN_A), /ID do usuário inválido/);
  await assert.rejects(service.changeRole(DEV_ID, { role: "po", ativo: false }, ADMIN_A), /Unrecognized key|Dados inválidos/);
  assert.equal(pool.log.length, 0);
});

test("S3-13 / PBI-06.2.1 cenário 3: bloqueia alteração do único administrador ativo com 409 e desfaz a transação", async () => {
  const pool = createFakePool(seedUsers());
  const service = new UserRolesService(new UserRolesRepository(pool as never));
  await assert.rejects(
    service.changeRole(ADMIN_A, { role: "dev" }, ADMIN_A),
    (error: { statusCode?: number; code?: string; message?: string }) =>
      error.statusCode === 409 && error.code === "LAST_ADMIN" && error.message === LAST_ADMIN_MESSAGE,
  );
  assert.equal(pool.users.get(ADMIN_A)?.role, "admin");
  assert.equal(pool.audits.length, 0);
  assert.ok(pool.log.includes("ROLLBACK"));
});

test("S3-13: administrador inativo não conta como administrador restante", async () => {
  const pool = createFakePool([...seedUsers(), { id: ADMIN_B, nome: "Bia Admin", email: "bia@sinapse.local", role: "admin", ativo: false }]);
  const service = new UserRolesService(new UserRolesRepository(pool as never));
  await assert.rejects(service.changeRole(ADMIN_A, { role: "po" }, ADMIN_A), /único administrador/);
});

test("S3-13: dois pedidos simultâneos de rebaixamento não deixam a plataforma sem administrador", async () => {
  const pool = createFakePool([...seedUsers(), { id: ADMIN_B, nome: "Bia Admin", email: "bia@sinapse.local", role: "admin", ativo: true }]);
  const service = new UserRolesService(new UserRolesRepository(pool as never));

  const results = await Promise.allSettled([
    service.changeRole(ADMIN_A, { role: "po" }, ADMIN_B),
    service.changeRole(ADMIN_B, { role: "dev" }, ADMIN_A),
  ]);

  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.equal((rejected.reason as { statusCode?: number }).statusCode, 409);
  const admins = [...pool.users.values()].filter((u) => u.role === "admin" && u.ativo);
  assert.equal(admins.length, 1);
  assert.equal(pool.audits.length, 1);
});

test("S3-13 / PBI-06.2.1 cenário 1: o papel novo vale no próximo acesso porque a sessão relê o papel do banco", async () => {
  let role: UserRole = "dev";
  const now = new Date("2026-11-19T12:00:00.000Z");
  const session = (): SessionWithUser => ({
    id: "s1", usuario_id: DEV_ID, token_hash: "h", created_at: now, ultima_atividade_em: now,
    revogada_em: null, nome: "Davi Dev", email: "davi@sinapse.local", role, ativo: true,
  });
  const sessions = new SessionService({
    async createSession() { throw new Error("não usado"); },
    async findSessionByTokenHash() { return session(); },
    async touchSession() {},
    async revokeSessionByTokenHash() {},
  }, () => now);

  const before = await sessions.validateSession("token");
  assert.equal(before.valid && before.user.role, "dev");
  role = "po"; // admin trocou o papel no banco; o token continua o mesmo
  const after = await sessions.validateSession("token");
  assert.equal(after.valid && after.user.role, "po");
});

async function withServer(app: express.Express, run: (baseUrl: string) => Promise<void>) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
}

function fakeAuth(getRole: () => UserRole, id = ADMIN_A): RequestHandler {
  return (req, _res, next) => {
    req.auth = { id, nome: "Teste", email: "teste@sinapse.local", role: getRole() };
    next();
  };
}

test("S3-13: rotas de perfis exigem administrador e devolvem 409 claro para o último admin", async () => {
  const pool = createFakePool(seedUsers());
  const userRoles = new UserRolesController(new UserRolesService(new UserRolesRepository(pool as never)));
  let currentRole: UserRole = "dev";
  const app = express();
  app.use(express.json());
  app.use("/api/v1/admin", createAdminRouter(new AdminController(), fakeAuth(() => currentRole), userRoles));
  app.use(errorHandler);

  await withServer(app, async (base) => {
    const patch = (id: string, body: unknown) => fetch(`${base}/api/v1/admin/users/${id}/role`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });

    assert.equal((await fetch(`${base}/api/v1/admin/users`)).status, 403);
    assert.equal((await patch(DEV_ID, { role: "admin" })).status, 403);
    currentRole = "po";
    assert.equal((await patch(DEV_ID, { role: "admin" })).status, 403);
    assert.equal(pool.audits.length, 0);

    currentRole = "admin";
    const list = await fetch(`${base}/api/v1/admin/users`);
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as { usuarios: PlatformUserRole[] };
    assert.deepEqual(listBody.usuarios.map((u) => u.role), ["admin", "dev", "po"]);
    assert.equal("senha_hash" in listBody.usuarios[0], false);

    const blocked = await patch(ADMIN_A, { role: "dev" });
    assert.equal(blocked.status, 409);
    assert.deepEqual(await blocked.json(), { error: LAST_ADMIN_MESSAGE, code: "LAST_ADMIN" });

    const invalid = await patch(DEV_ID, { role: "root" });
    assert.equal(invalid.status, 400);

    const ok = await patch(DEV_ID, { role: "admin" });
    assert.equal(ok.status, 200);
    const okBody = (await ok.json()) as { usuario: PlatformUserRole; message: string };
    assert.equal(okBody.usuario.role, "admin");
    assert.equal(okBody.message, NEXT_ACCESS_MESSAGE);
  });
});

test("S3-13 / PBI-06.2.1 cenário 2: perfil dev recebe 403 em toda escrita de itens de trabalho", async () => {
  const app = express();
  app.use(express.json());
  const mount = (path: string, router: Router) => app.use(path, fakeAuth(() => "dev", DEV_ID), router);
  mount("/api/v1/epics", epicsRouter);
  mount("/api/v1/features", featuresRouter);
  mount("/api/v1/pbis", pbisRouter);
  mount("/api/v1/criteria", criteriaRouter);
  app.use(errorHandler);

  const id = "50000000-0000-4000-8000-000000000001";
  const writes: Array<[string, string]> = [
    ["POST", "/api/v1/epics"], ["PUT", `/api/v1/epics/${id}`], ["PATCH", `/api/v1/epics/${id}`],
    ["PATCH", `/api/v1/epics/${id}/complete`], ["PATCH", `/api/v1/epics/${id}/archive`],
    ["POST", "/api/v1/features"], ["PATCH", `/api/v1/features/${id}`], ["PATCH", `/api/v1/features/${id}/archive`],
    ["POST", "/api/v1/pbis"], ["PUT", `/api/v1/pbis/${id}`], ["PATCH", `/api/v1/pbis/${id}`],
    ["PATCH", `/api/v1/pbis/${id}/complete`], ["POST", `/api/v1/pbis/${id}/relations`], ["PATCH", `/api/v1/pbis/${id}/archive`],
    ["POST", "/api/v1/criteria"], ["DELETE", `/api/v1/criteria/${id}`], ["PATCH", `/api/v1/criteria/${id}/move`],
  ];

  await withServer(app, async (base) => {
    for (const [method, path] of writes) {
      const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: "{}" });
      assert.equal(response.status, 403, `${method} ${path} deve ser bloqueado para dev`);
    }
  });
});

test("S3-13: contrato OpenAPI documenta a administração de perfis", () => {
  const openapiPath = existsSync(resolve(process.cwd(), "docs/api/openapi.yaml"))
    ? resolve(process.cwd(), "docs/api/openapi.yaml")
    : resolve(process.cwd(), "../docs/api/openapi.yaml");
  const doc = parse(readFileSync(openapiPath, "utf8")) as {
    paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
    components: { schemas: Record<string, unknown> };
  };
  assert.ok(doc.paths["/api/v1/admin/users"]?.get, "GET /api/v1/admin/users documentado");
  const patch = doc.paths["/api/v1/admin/users/{id}/role"]?.patch;
  assert.ok(patch, "PATCH /api/v1/admin/users/{id}/role documentado");
  assert.ok(patch.responses?.["409"], "409 do último administrador documentado");
  assert.ok(doc.components.schemas.PlatformUserRole);
  assert.ok(doc.components.schemas.ChangeUserRoleRequest);
});
