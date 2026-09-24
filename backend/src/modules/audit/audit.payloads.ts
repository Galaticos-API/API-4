/** Builds a backward-compatible audit payload without duplicating justification. */
export function buildAuditChangeData<Before extends object, After extends object>(
  beforeValue: Before,
  afterValue: After,
  requestedChanges: Record<string, unknown>,
): Record<string, unknown> {
  const before = beforeValue as Record<string, unknown>;
  const after = afterValue as Record<string, unknown>;
  const fields = Object.keys(requestedChanges).filter(
    (field) => field !== "justificativa" && field in before && field in after,
  );
  const pick = (source: Record<string, unknown>) => Object.fromEntries(
    fields.map((field) => [field, source[field]]),
  );

  return {
    alteracoes: pick(after),
    anterior: pick(before),
    novo: pick(after),
  };
}
