import test from 'node:test';
import assert from 'node:assert/strict';
import { createSuggestionSchema, resolveAcceptSchema, resolveEditSchema } from './suggestions.types.js';

test('sugestões recusam texto inválido em valores, origem e justificativas', () => {
  for (const invalid of ['QA\u0000', 'QA\ud800', 'QA\udfff']) {
    assert.equal(createSuggestionSchema('epico').safeParse({ campo: 'descricao', valor_sugerido: invalid }).success, false);
    assert.equal(createSuggestionSchema('feature').safeParse({ campo: 'descricao', valor_sugerido: 'Válido', origem: invalid }).success, false);
    assert.equal(resolveEditSchema('titulo').safeParse({ valor: invalid }).success, false);
    assert.equal(resolveEditSchema('titulo').safeParse({ valor: 'Válido', justificativa: invalid }).success, false);
    assert.equal(resolveAcceptSchema.safeParse({ justificativa: invalid }).success, false);
  }
  assert.equal(createSuggestionSchema('pbi').safeParse({ campo: 'titulo', valor_sugerido: 'Consultar histórico 😀' }).success, true);
});
