import { z } from 'zod';

const position = z.object({ at: z.string().datetime({ precision: 6 }), id: z.string().uuid() }).strict();
export const backlogCursorSchema = z.string().max(300).transform((value, ctx) => {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Formato inválido');
    const parsed = position.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (parsed.success) return parsed.data;
  } catch { /* O cursor não contém dados privilegiados; é apenas uma posição validada. */ }
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cursor de paginação inválido.' });
  return z.NEVER;
});

export function backlogPage<T extends { id: string; pagination_at?: string }>(rows: T[], limit: number) {
  const last = rows.at(-1);
  const next_cursor = rows.length === limit && last
    ? Buffer.from(JSON.stringify({ at: last.pagination_at, id: last.id })).toString('base64url') : null;
  return { items: rows.map(({ pagination_at: _, ...item }) => item), next_cursor };
}

export function cursorTimestamp(alias: string): string {
  return `to_char(${alias}.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS pagination_at`;
}
