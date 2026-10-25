import { z } from 'zod';

export const validDatabaseText = (value: string): boolean => !/[\u0000\uD800-\uDFFF]/u.test(value);

export function validateTextFields(value: unknown, ctx: z.RefinementCtx, path: (string | number)[] = []): void {
  if (typeof value === 'string' && !validDatabaseText(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Use texto Unicode válido, sem caractere nulo.' });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => validateTextFields(item, ctx, [...path, index]));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => validateTextFields(item, ctx, [...path, key]));
  }
}

export function validProjectDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (value.length > 10) {
    const hour = Number(value.slice(11, 13)), minute = Number(value.slice(14, 16)), second = Number(value.slice(17, 19));
    if (hour > 23 || minute > 59 || second > 59) return false;
    const offset = /[+-](\d{2}):(\d{2})$/.exec(value);
    if (offset && (Number(offset[1]) > 15 || Number(offset[2]) > 59)) return false;
  }
  return day <= days[month - 1] && Number.isFinite(Date.parse(value));
}
