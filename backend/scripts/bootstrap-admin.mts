/**
 * Cria (ou promove) o usuário administrador local de desenvolvimento/teste.
 *
 * O cadastro público (POST /api/v1/auth/register) só cria contas "dev" —
 * criar "po"/"admin" exige já estar autenticado como admin, de propósito
 * (evita que qualquer pessoa se auto-promova). Isso cria um impasse no
 * primeiro acesso: sem nenhum admin, ninguém consegue criar o primeiro.
 * Este script resolve isso diretamente no banco, reaproveitando o mesmo
 * hashPassword() que o backend usa (scrypt), então o hash gerado é válido
 * para login normal pela API.
 *
 * Uso:
 *   cd backend
 *   npx tsx scripts/bootstrap-admin.mts
 *   npx tsx scripts/bootstrap-admin.mts --email=outro@exemplo.com --password=Outra@123 --nome="Outro Nome"
 *
 * Idempotente: se o e-mail já existir, apenas garante role='admin' e NÃO
 * sobrescreve a senha (a menos que --password seja passado explicitamente
 * em conjunto com --force-password).
 */
import { pool } from "../src/database/db.js";
import { hashPassword } from "../src/modules/auth/pssword.service.js";

const DEFAULT_EMAIL = "admin@sinapse.local";
const DEFAULT_PASSWORD = "Admin@123";
const DEFAULT_NOME = "Admin Local";

function argValue(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

const email = (argValue("email") ?? DEFAULT_EMAIL).trim().toLowerCase();
const password = argValue("password") ?? DEFAULT_PASSWORD;
const nome = argValue("nome") ?? DEFAULT_NOME;
const forcePassword = process.argv.includes("--force-password");

try {
  const existing = await pool.query<{ id: string; role: string }>(
    "SELECT id, role FROM usuario WHERE email = $1",
    [email],
  );

  if (existing.rows[0]) {
    const { id, role } = existing.rows[0];
    if (forcePassword) {
      const senha_hash = await hashPassword(password);
      await pool.query("UPDATE usuario SET role = 'admin', senha_hash = $2 WHERE id = $1", [id, senha_hash]);
      console.log(`[bootstrap-admin] Conta existente (${email}) promovida a admin e senha redefinida.`);
    } else if (role !== "admin") {
      await pool.query("UPDATE usuario SET role = 'admin' WHERE id = $1", [id]);
      console.log(`[bootstrap-admin] Conta existente (${email}) promovida a admin. Senha mantida.`);
    } else {
      console.log(`[bootstrap-admin] ${email} já é admin. Nada a fazer.`);
    }
  } else {
    const senha_hash = await hashPassword(password);
    await pool.query(
      "INSERT INTO usuario (nome, email, senha_hash, role) VALUES ($1, $2, $3, 'admin')",
      [nome, email, senha_hash],
    );
    console.log(`[bootstrap-admin] Criado admin ${email} / senha: ${password}`);
  }
} finally {
  await pool.end();
}
