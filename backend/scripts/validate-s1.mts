/** Run only against a disposable PostgreSQL database after npm run migrate. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { once } from "node:events";
import { app } from "../src/index.js";
import { pool } from "../src/database/db.js";
import { env } from "../src/config/env.js";
import { hashPassword } from "../src/modules/auth/pssword.service.js";
import { apiRequest, readUser } from "../../frontend/src/auth/api.ts";
import { createProject, getProject, listProjects } from "../../frontend/src/projects/api.ts";

assert.equal(env.NODE_ENV, "test", "Execute com NODE_ENV=test");
assert.match(env.POSTGRES_DB, /_s1_validation$/, "Use um banco descartável terminado em _s1_validation");
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
const nativeFetch = globalThis.fetch;
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const browserEvents = new EventTarget();
Object.defineProperty(globalThis, "window", { configurable: true, value: browserEvents });
let cookie = "";
let lastCookie = "";
globalThis.fetch = async (input, init = {}) => {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  const response = await nativeFetch(new URL(String(input), base), { ...init, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) { lastCookie = setCookie; cookie = setCookie.split(";")[0]; }
  return response;
};
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  console.log(`PASS ${++passed}: ${name}`);
}
const id = randomUUID();
const email = `validacao-${id}@example.com`;
const password = "Senha-Temporaria-S1-2026!";
const login = (supplied = password, identifier = email) => fetch("/api/v1/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: identifier, password: supplied }),
});
const reauthenticate = async () => { const response = await login(); assert.equal(response.status, 200); return readUser(response); };
try {
  const hashed = await hashPassword(password);
  await pool.query("INSERT INTO usuario (id, nome, email, senha_hash, role) VALUES ($1, $2, $3, $4, 'po')", [id, "Pessoa de Validação", email, hashed]);
  await check("migrações registradas e papel inválido recusado pelo PostgreSQL", async () => {
    const migrations = await pool.query("SELECT version FROM _schema_migrations");
    assert.ok(migrations.rows.some(row => row.version === "004_identity_domain.sql"));
    await assert.rejects(pool.query("UPDATE usuario SET role = 'invalid' WHERE id = $1", [id]), { code: "23514" });
  });
  await check("rotas privadas recusam acesso sem cookie", async () => {
    for (const route of ["/api/v1/auth/me", "/api/v1/projects", "/api/projects"]) assert.equal((await fetch(route)).status, 401);
  });
  await check("credenciais incorretas e usuário inexistente retornam o mesmo erro", async () => {
    const wrong = await login("errada");
    const missing = await login("errada", "inexistente@example.com");
    assert.equal(wrong.status, 401); assert.equal(missing.status, 401);
    assert.deepEqual(await wrong.json(), await missing.json());
  });
  await check("bloqueio configurado produz 429 e impede senha correta até liberação", async () => {
    await pool.query("UPDATE usuario SET tentativas_login = 0, bloqueado_ate = NULL WHERE id = $1", [id]);
    for (let i = 1; i <= env.AUTH_MAX_LOGIN_ATTEMPTS; i++) assert.equal((await login("errada")).status, i === env.AUTH_MAX_LOGIN_ATTEMPTS ? 429 : 401);
    assert.equal((await login()).status, 429);
    await pool.query("UPDATE usuario SET bloqueado_ate = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE id = $1", [id]);
  });
  await check("login real lido pelo adaptador S1-02, cookie HttpOnly e token armazenado só como hash", async () => {
    const user = await reauthenticate();
    assert.deepEqual(user, { id, name: "Pessoa de Validação", email, role: "po" });
    assert.match(lastCookie, /HttpOnly/i); assert.match(lastCookie, /SameSite=Lax/i); assert.match(lastCookie, /Path=\//i);
    const token = cookie.split("=")[1];
    const stored = await pool.query("SELECT token_hash FROM sessao WHERE usuario_id = $1 ORDER BY created_at DESC LIMIT 1", [id]);
    assert.notEqual(stored.rows[0].token_hash, token);
    assert.equal(stored.rows[0].token_hash.trim(), createHash("sha256").update(token).digest("hex"));
    const attempts = await pool.query("SELECT tentativas_login, bloqueado_ate FROM usuario WHERE id = $1", [id]);
    assert.equal(attempts.rows[0].tentativas_login, 0); assert.equal(attempts.rows[0].bloqueado_ate, null);
    assert.deepEqual(await readUser(await apiRequest("/auth/me")), user);
  });
  await check("papéis admin, po e dev são restaurados da base sem nova implantação", async () => {
    for (const role of ["admin", "dev", "po"]) {
      await pool.query("UPDATE usuario SET role = $1 WHERE id = $2", [role, id]);
      assert.equal((await readUser(await apiRequest("/auth/me"))).role, role);
    }
  });
  await check("configuração organizacional de qualidade exige admin, versiona e audita alteração", async () => {
    const configUrl = "/api/v1/quality/configuration/pbi";
    assert.equal((await fetch(configUrl)).status, 200);
    const current = await (await fetch(configUrl)).json() as { rule_version: string; checks: Record<string, boolean>; vague_terms: string[] };
    assert.equal((await fetch(configUrl, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current) })).status, 403);

    await pool.query("UPDATE usuario SET role = 'admin' WHERE id = $1", [id]);
    await reauthenticate();
    const updatedInput = { ...current, checks: { ...current.checks, termos_vagos: !current.checks.termos_vagos }, vague_terms: [...current.vague_terms, "verificável"] };
    const updatedResponse = await fetch(configUrl, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checks: updatedInput.checks, vague_terms: updatedInput.vague_terms }) });
    assert.equal(updatedResponse.status, 200);
    const updated = await updatedResponse.json() as { rule_version: string; checks: Record<string, boolean>; vague_terms: string[]; updated_by: { id: string }; updated_at: string };
    assert.notEqual(updated.rule_version, current.rule_version);
    assert.equal(updated.checks.termos_vagos, updatedInput.checks.termos_vagos);
    assert.ok(updated.vague_terms.includes("verificável"));
    assert.equal(updated.updated_by.id, id);
    assert.ok(updated.updated_at);
    const audit = await pool.query("SELECT usuario_id, dados_json FROM auditoria WHERE entidade_tipo = 'quality_configuration' AND entidade_id = $1::uuid ORDER BY created_at DESC LIMIT 1", ["00000000-0000-4000-8000-000000000001"]);
    assert.equal(audit.rows[0].usuario_id, id);
    assert.equal(audit.rows[0].dados_json.actor_id, id);
    assert.equal(audit.rows[0].dados_json.after.checks.termos_vagos, updatedInput.checks.termos_vagos);

    const create = async (path: string, body: unknown) => {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      assert.equal(response.status, 201, `${path}: ${await response.clone().text()}`);
      return response.json() as Promise<Record<string, any>>;
    };
    const project = await create("/api/v1/projects", { nome: `Qualidade ${id}`, cliente: "QA" });
    const epic = await create("/api/v1/epics", { projeto_id: project.id, titulo: "Organizar qualidade" });
    const feature = await create("/api/v1/features", { epico_id: epic.id, titulo: "Exibir indicador" });
    const pbi = await create("/api/v1/pbis", {
      feature_id: feature.id, titulo: "Consultar indicador", historia_como_um: "Product Owner",
      historia_eu_quero: "consultar a completude", historia_para_que: "acompanhar a maturidade",
    });
    const criterion = await create("/api/v1/criteria", {
      entidade_tipo: "pbi", entidade_id: pbi.id, nome: "Consulta", dado: "um item existente",
      quando: "eu abrir o backlog", entao: "o indicador deve aparecer",
    });
    assert.ok(criterion.id);
    assert.equal((await fetch(`/api/v1/pbis/${pbi.id}/complete`, { method: "PATCH" })).status, 200);
    const beforeChange = await (await fetch(`/api/v1/quality/pbis/${pbi.id}/quality`)).json() as { rule_version: string; checks: Array<{ check_id: string }> };
    assert.equal(beforeChange.checks.length, 4);

    const revisedConfiguration = { checks: { ...current.checks, titulo_infinitivo: false }, vague_terms: current.vague_terms };
    assert.equal((await fetch(configUrl, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(revisedConfiguration) })).status, 200);
    const afterChange = await (await fetch(`/api/v1/quality/pbis/${pbi.id}/quality`)).json() as { rule_version: string; checks: Array<{ check_id: string }> };
    assert.notEqual(afterChange.rule_version, beforeChange.rule_version);
    assert.equal(afterChange.checks.some(({ check_id }) => check_id === "titulo_infinitivo"), false);
    assert.equal((await (await fetch(`/api/v1/pbis/${pbi.id}`)).json()).status, "concluido");

    await fetch(configUrl, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checks: current.checks, vague_terms: current.vague_terms }) });
    await pool.query("UPDATE usuario SET role = 'po' WHERE id = $1", [id]);
    await reauthenticate();
  });
  await check("perfil dev lê projetos mas não pode criar, editar ou arquivar", async () => {
    await pool.query("UPDATE usuario SET role = 'dev' WHERE id = $1", [id]);
    assert.equal((await fetch("/api/v1/projects")).status, 200);
    for (const prefix of ["/api/v1/projects", "/api/projects"]) {
      for (const [method, route] of [["POST", prefix], ["PUT", `${prefix}/${randomUUID()}`], ["PATCH", `${prefix}/${randomUUID()}`], ["PATCH", `${prefix}/${randomUUID()}/archive`]]) {
        assert.equal((await fetch(route, { method, headers: { "Content-Type": "application/json" }, body: "{}" })).status, 403);
      }
    }
    await pool.query("UPDATE usuario SET role = 'po' WHERE id = $1", [id]);
  });
  await check("S1-04 cria, lista e consulta projeto real; autoria persistida em auditoria", async () => {
    const project = await createProject({ nome: `Projeto ${id}`, cliente: "Cliente de validação", descricao: "Integração S1" });
    assert.equal(project.status, "ativo");
    const signal = AbortSignal.timeout(10000);
    assert.equal((await getProject(project.id, signal)).nome, project.nome);
    const page = await listProjects(signal);
    assert.ok(page.projects.some(item => item.id === project.id));
    const audit = await pool.query("SELECT usuario_id FROM auditoria WHERE entidade_id = $1 AND acao = 'CRIAR_PROJETO'", [project.id]);
    assert.equal(audit.rows[0].usuario_id, id);
    await assert.rejects(createProject({ nome: project.nome.toUpperCase(), cliente: "Outro", descricao: "" }), { status: 409 });
    await assert.rejects(createProject({ nome: " ", cliente: "Cliente", descricao: "" }), { status: 400 });
    await assert.rejects(getProject(randomUUID(), signal), { status: 404 });
  });
  await check("descrição nula, demais status e paginação são aceitos pelo frontend", async () => {
    await pool.query("INSERT INTO projeto (nome, cliente, status) SELECT $1 || n::text, 'Cliente', CASE WHEN n % 2 = 0 THEN 'concluido' ELSE 'em_andamento' END FROM generate_series(1, 51) n", [`Página ${id} `]);
    const first = await listProjects(AbortSignal.timeout(10000));
    const second = await listProjects(AbortSignal.timeout(10000), 50);
    assert.equal(first.projects.length, 50); assert.ok(second.projects.length > 0);
    assert.ok(first.projects.some(item => item.descricao === ""));
  });
  await check("inatividade revoga sessão no banco e emite evento de expiração no cliente", async () => {
    let expired = false;
    browserEvents.addEventListener("session-expired", () => { expired = true; }, { once: true });
    await pool.query("UPDATE sessao SET ultima_atividade_em = CURRENT_TIMESTAMP - ($1 * INTERVAL '1 minute') WHERE usuario_id = $2", [env.AUTH_SESSION_IDLE_MINUTES + 1, id]);
    await assert.rejects(listProjects(AbortSignal.timeout(10000)), { status: 401 });
    assert.equal(expired, true);
    const sessions = await pool.query("SELECT revogada_em FROM sessao WHERE usuario_id = $1", [id]);
    assert.ok(sessions.rows.every(row => row.revogada_em));
  });
  await check("expiração absoluta é aplicada mesmo com atividade recente", async () => {
    await reauthenticate();
    await pool.query("UPDATE sessao SET created_at = CURRENT_TIMESTAMP - ($1 * INTERVAL '1 hour') WHERE usuario_id = $2 AND revogada_em IS NULL", [env.AUTH_SESSION_MAX_HOURS + 1, id]);
    assert.equal((await fetch("/api/v1/auth/me")).status, 401);
  });
  await check("usuário desativado perde sessão e não pode iniciar outra", async () => {
    await reauthenticate();
    await pool.query("UPDATE usuario SET ativo = FALSE WHERE id = $1", [id]);
    assert.equal((await fetch("/api/v1/auth/me")).status, 401);
    assert.equal((await login()).status, 403);
    await pool.query("UPDATE usuario SET ativo = TRUE WHERE id = $1", [id]);
  });
  await check("logout remove cookie e impede reutilização do token revogado", async () => {
    await reauthenticate();
    const previous = cookie;
    const result = await apiRequest("/auth/logout", { method: "POST" });
    assert.equal(result.status, 204); assert.match(lastCookie, /Expires=Thu, 01 Jan 1970/i);
    cookie = previous;
    assert.equal((await fetch("/api/v1/auth/me")).status, 401);
    assert.equal((await fetch("/api/v1/projects")).status, 401);
  });
  console.log(`Validação S1 concluída: ${passed} cenários com HTTP e PostgreSQL reais.`);
} finally {
  globalThis.fetch = nativeFetch;
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
}
