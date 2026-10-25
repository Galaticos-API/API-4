import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { backlogCursorSchema, backlogPage } from './backlog-cursor.js';

test('cursor preserva microssegundos e funciona sem depender da existência da linha de origem', () => {
  const row = { id: randomUUID(), pagination_at: '2026-01-01T12:00:00.000123Z', titulo: 'Item' };
  const page = backlogPage([row], 1);
  assert.deepEqual(backlogCursorSchema.parse(page.next_cursor), { id: row.id, at: row.pagination_at });
  assert.equal('pagination_at' in page.items[0], false);
  assert.equal(backlogPage([], 100).next_cursor, null);
  assert.equal(backlogPage([row], 100).next_cursor, null);
});

test('cursor malformado é recusado antes de chegar ao SQL', () => {
  for (const cursor of ['invalid', '%%%', Buffer.from(JSON.stringify({ at: '2026-02-30T00:00:00.000000Z', id: randomUUID() })).toString('base64url'), Buffer.from(JSON.stringify({ at: '2026-01-01T00:00:00.000001Z', id: 'x' })).toString('base64url')]) {
    assert.equal(backlogCursorSchema.safeParse(cursor).success, false);
  }
});
