import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validateTarget } from "../../database/seed-lib.js";

test("Cadastro preserva sessões existentes e trata concorrência", { skip: !process.env.ARCHIVE_TEST_DATABASE_URL }, async t => {
  const { app } = await import("../../app.js");
  const { pool } = await import("../../database/db.js");
  const { sessionService } = await import("./session.service.js");
  const { authRepository } = await import("./auth.repository.js");
  const db = new Pool({ connectionString: validateTarget(process.env.ARCHIVE_TEST_DATABASE_URL, "test") });
  const [admin, dev] = [randomUUID(), randomUUID()];
  const emails: string[] = [];
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + (server.address() as {port:number}).port + "/api/v1";
  const data = (role = "dev", email = randomUUID() + "@registration.test") => {
    emails.push(email);
    return { nome: "Conta QA", email, password: randomUUID(), role };
  };
  const register = (body: unknown, cookie?: string) => fetch(base + "/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  try {
    for (const [id, role] of [[admin,"admin"],[dev,"dev"]]) {
      await db.query("INSERT INTO usuario(id,nome,email,senha_hash,role) VALUES ($1,'QA',$2,'h',$3)", [id,id + "@registration.test",role]);
    }
    const adminCookie = "sinapse_session=" + (await sessionService.createSession(admin)).token;
    const devCookie = "sinapse_session=" + (await sessionService.createSession(dev)).token;
    await t.test("admin cria PO, admin e dev sem trocar sessão ou emitir token da outra conta", async () => {
      for (const role of ["po","admin","dev"]) {
        const response = await register(data(role), adminCookie);
        assert.equal(response.status, 201);
        assert.equal(response.headers.get("set-cookie"), null);
        const result = await response.json() as { user: { id: string; role: string }; token?: string };
        assert.equal(result.user.role, role);
        assert.equal(result.token, undefined);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM sessao WHERE usuario_id=$1", [result.user.id])).rows[0].n, 0);
      }
      const me = await fetch(base + "/auth/me", {headers:{Cookie:adminCookie}});
      assert.equal((await me.json() as {user:{role:string}}).user.role, "admin");
      assert.equal((await fetch(base + "/admin/stats", {headers:{Cookie:adminCookie}})).status,200);
    });
    await t.test("cadastro público de dev mantém login automático", async () => {
      const response = await register(data());
      assert.equal(response.status, 201);
      const result = await response.json() as {token:string;user:{id:string}};
      assert.ok(result.token);
      assert.match(response.headers.get("set-cookie") ?? "", /sinapse_session=/);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM sessao WHERE usuario_id=$1", [result.user.id])).rows[0].n, 1);
    });
    await t.test("visitante e dev não cadastram PO ou admin", async () => {
      for (const cookie of [undefined,devCookie]) {
        for (const role of ["po","admin"]) {
          const body = data(role);
          assert.equal((await register(body,cookie)).status,403);
          assert.equal((await db.query("SELECT count(*)::int AS n FROM usuario WHERE email=$1", [body.email])).rows[0].n,0);
        }
      }
    });
    await t.test("cadastros simultâneos do mesmo e-mail retornam EMAIL_EXISTS sem mensagem de projeto", async st => {
      const body = data();
      const original = authRepository.findUserByEmail.bind(authRepository);
      let arrivals = 0;
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      st.mock.method(authRepository, "findUserByEmail", async (email: string) => {
        const result = await original(email);
        if (email === body.email) {
          if (++arrivals === 2) release();
          await gate;
        }
        return result;
      });
      const responses = await Promise.all([register(body),register(body)]);
      assert.deepEqual(responses.map(r => r.status).sort(), [201,409]);
      const duplicate = responses.find(r => r.status === 409)!;
      const error = await duplicate.json() as {code:string;error:string};
      assert.equal(error.code,"EMAIL_EXISTS");
      assert.doesNotMatch(error.error,/projeto/i);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM usuario WHERE email=$1",[body.email])).rows[0].n,1);
    });
    await t.test("falha ao gravar a sessão desfaz a conta e permite repetir o cadastro", async () => {
      const body = data();
      try {
        await db.query("CREATE TABLE qa_registration_failure(email text PRIMARY KEY)");
        await db.query("INSERT INTO qa_registration_failure(email) VALUES ($1)", [body.email]);
        await db.query(`CREATE FUNCTION qa_registration_failure() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF EXISTS (SELECT 1 FROM usuario u JOIN qa_registration_failure q ON q.email=u.email WHERE u.id=NEW.usuario_id)
            THEN RAISE EXCEPTION 'QA_SESSION_FAILURE'; END IF;
            RETURN NEW;
          END $$`);
        await db.query("CREATE TRIGGER qa_registration_failure BEFORE INSERT ON sessao FOR EACH ROW EXECUTE FUNCTION qa_registration_failure()");
        const failed = await register(body);
        assert.equal(failed.status, 500);
        assert.equal(failed.headers.get("set-cookie"), null);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM usuario WHERE email=$1", [body.email])).rows[0].n, 0);
        await db.query("DROP TRIGGER qa_registration_failure ON sessao");
        const retried = await register(body);
        assert.equal(retried.status, 201);
        const result = await retried.json() as { token: string; user: { id: string } };
        assert.ok(result.token);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM usuario WHERE email=$1", [body.email])).rows[0].n, 1);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM sessao WHERE usuario_id=$1", [result.user.id])).rows[0].n, 1);
        const me = await fetch(base + "/auth/me", { headers: { Authorization: "Bearer " + result.token } });
        assert.equal(me.status, 200);
      } finally {
        await db.query("DROP TRIGGER IF EXISTS qa_registration_failure ON sessao");
        await db.query("DROP FUNCTION IF EXISTS qa_registration_failure()");
        await db.query("DROP TABLE IF EXISTS qa_registration_failure");
      }
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.query("DELETE FROM usuario WHERE id=ANY($1::uuid[]) OR email=ANY($2::text[])",[[admin,dev],emails]);
    await db.end();
    await pool.end();
  }
});
