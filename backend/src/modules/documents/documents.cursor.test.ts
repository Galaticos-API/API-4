import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DocumentsService } from './documents.service.js';
import { ValidationError } from '../../shared/errors.js';

test('cursor de documentos recusa datas inválidas antes de consultar o banco', async () => {
  let calls = 0;
  const service = new DocumentsService({ listByProject: async () => { calls++; return { items: [], hasMore: false }; } } as any,
    {} as any, {} as any, { findById: async () => ({ id: randomUUID(), status: 'ativo' }) });
  for (const date of ['0', '2026-02-30T12:00:00Z', '2026-10-25T12:00:00+23:00', '2026-10-25', '2026-10-25T12:00:00-16:00']) {
    const cursor = Buffer.from(JSON.stringify({ created_at: date, id: randomUUID() })).toString('base64url');
    await assert.rejects(() => service.list(randomUUID(), cursor), ValidationError);
  }
  assert.equal(calls, 0);
});

test('cursor de documentos mantém os microssegundos do formato produzido pelo PostgreSQL', async () => {
  const received: unknown[] = [];
  const service = new DocumentsService({ listByProject: async (_id: string, cursor: unknown) => { received.push(cursor); return { items: [], hasMore: false }; } } as any,
    {} as any, {} as any, { findById: async () => ({ id: randomUUID(), status: 'ativo' }) });
  const id = randomUUID();
  for (const timestamp of ['2026-10-25 12:00:00.000123+00', '2026-10-25T12:00:00.000123Z', '2026-10-25 12:00:00.000123-03:00']) {
    await service.list(randomUUID(), Buffer.from(JSON.stringify({ created_at: timestamp, id })).toString('base64url'));
  }
  assert.deepEqual(received, [{ createdAt: '2026-10-25T12:00:00.000123+00:00', id }, { createdAt: '2026-10-25T12:00:00.000123Z', id }, { createdAt: '2026-10-25T12:00:00.000123-03:00', id }]);
});
