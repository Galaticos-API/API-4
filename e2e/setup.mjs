import { randomBytes, scryptSync } from 'node:crypto';
import { testDatabase } from './database.mjs';

// Test-only bootstrap: no production endpoint or change to registration authorization.
export async function setup() {
  const salt = randomBytes(16).toString('hex');
  const hash = ['scrypt', 'v1', salt, scryptSync('E2E-admin-only-123', salt, 64).toString('hex')].join('$');
  await testDatabase(async db => {
    await db.query(`INSERT INTO usuario(nome,email,senha_hash,role) VALUES('Admin E2E','admin@e2e.test',$1,'admin')
      ON CONFLICT(email) DO UPDATE SET senha_hash=$1, role='admin', tentativas_login=0, bloqueado_ate=NULL`, [hash]);
  });
}
