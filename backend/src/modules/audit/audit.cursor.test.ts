import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { encodeAuditCursor, decodeAuditCursor } from './audit.service.js';
import { ValidationError } from '../../shared/errors.js';

test('cursor da auditoria preserva microssegundos e aceita cursores antigos em milissegundos', () => {
  for (const created_at of ['2026-10-25T12:00:00.000900Z', '2026-10-25T12:00:00.000Z']) {
    const cursor = { created_at, id: randomUUID() };
    assert.deepEqual(decodeAuditCursor(encodeAuditCursor(cursor)), cursor);
  }
});

test('cursor da auditoria rejeita datas inválidas em vez de normalizar ou enviar ao SQL', () => {
  for (const created_at of ['0', '2026-02-30T12:00:00Z', '2026-10-25', '2026-10-25T12:00:00+23:00']) {
    assert.throws(() => decodeAuditCursor(encodeAuditCursor({ created_at, id: randomUUID() })), ValidationError);
  }
});
