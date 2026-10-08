import test from 'node:test';
import assert from 'node:assert/strict';
import { assertValidationDatabase } from './validation-target';
import { databasePoolConfig } from './pool-config';

test('validação recusa o banco efetivo mesmo com POSTGRES_DB de teste', () => {
  const config = databasePoolConfig({ DATABASE_URL: 'postgresql://localhost/production',
    POSTGRES_DB: 'sinapse_s1_validation', POSTGRES_HOST: 'localhost', POSTGRES_PORT: 5432,
    POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test' });
  assert.equal(config.connectionString, 'postgresql://localhost/production');
  assert.equal(config.database, undefined);
  assert.throws(() => assertValidationDatabase('production'));
  assert.throws(() => assertValidationDatabase(undefined));
  assert.doesNotThrow(() => assertValidationDatabase('sinapse_s1_validation'));
});
