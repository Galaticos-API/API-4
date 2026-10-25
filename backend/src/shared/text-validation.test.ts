import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectSchema, updateProjectSchema } from '../modules/projects/projects.types.js';
import { registerSchema } from '../modules/auth/auth.types.js';
import { vagueTermSchema } from '../modules/quality/organization-quality.types.js';
import { validDatabaseText, validProjectDate } from './text-validation.js';
import { createEpicSchema, updateEpicSchema } from '../modules/epics/epics.types.js';
import { createFeatureSchema, updateFeatureSchema } from '../modules/features/features.types.js';
import { createPbiSchema, updatePbiSchema } from '../modules/pbis/pbis.types.js';
import { createCriterionSchema } from '../modules/criteria/criteria.types.js';
import { randomUUID } from 'node:crypto';

test('texto persistido recusa NUL e substitutos isolados, mas preserva emojis', () => {
  for (const invalid of ['x\u0000', 'x\ud800', 'x\udfff']) {
    assert.equal(validDatabaseText(invalid), false);
    assert.equal(vagueTermSchema.safeParse(invalid).success, false);
    assert.equal(createProjectSchema.safeParse({ nome: invalid, cliente: 'Cliente' }).success, false);
    assert.equal(updateProjectSchema.safeParse({ descricao: invalid }).success, false);
  }
  assert.equal(validDatabaseText('Projeto 😀 ação'), true);
  assert.equal(vagueTermSchema.parse(' ação 😀 '), 'ação 😀');
});

test('datas de projeto respeitam formato, calendário e anos bissextos', () => {
  for (const date of ['0', '2026-02-30', '2025-02-29', '1900-02-29', '2026-04-31', '2026-00-10', '0000-01-01', '2026-01-01T99:00:00Z', '2026-10-25T12:00:00+23:00', '2026-10-25T12:00:00-16:00', '2026-10-25T24:00:00Z', '2026-10-25T12:00:00+15:60']) {
    assert.equal(validProjectDate(date), false, date);
    assert.equal(createProjectSchema.safeParse({ nome: 'Projeto', cliente: 'Cliente', data_inicio: date }).success, false);
    assert.equal(updateProjectSchema.safeParse({ data_inicio: date }).success, false);
  }
  for (const date of ['2024-02-29', '2000-02-29', '2026-10-25', '2026-10-25T14:30:00-03:00', '2026-10-25T12:00:00+15:59', '2026-10-25T12:00:00-15:59']) assert.equal(validProjectDate(date), true, date);
});

test('e-mail respeita o limite do banco após trim', () => {
  const input = { nome: 'Pessoa QA', password: 'valid-password' };
  assert.equal(registerSchema.safeParse({ ...input, email: 'a'.repeat(242) + '@example.test' }).success, true);
  assert.equal(registerSchema.safeParse({ ...input, email: 'a'.repeat(244) + '@example.test' }).success, false);
});

test('todos os níveis do backlog e seus critérios rejeitam texto incompatível com o banco', () => {
  const id = randomUUID();
  for (const invalid of ['QA\u0000', 'QA\ud800', 'QA\udfff']) {
    assert.equal(createEpicSchema.safeParse({ projeto_id: id, titulo: invalid }).success, false);
    assert.equal(createFeatureSchema.safeParse({ epico_id: id, titulo: invalid }).success, false);
    assert.equal(createPbiSchema.safeParse({ feature_id: id, titulo: invalid, historia_como_um: 'PO', historia_eu_quero: 'Testar', historia_para_que: 'Validar' }).success, false);
    for (const schema of [updateEpicSchema, updateFeatureSchema, updatePbiSchema]) assert.equal(schema.safeParse({ titulo: invalid }).success, false);
    assert.equal(createCriterionSchema.safeParse({ entidade_tipo: 'epico', entidade_id: id, texto: invalid }).success, false);
    assert.equal(createCriterionSchema.safeParse({ entidade_tipo: 'pbi', entidade_id: id, nome: 'Teste', dado: 'Condição', quando: 'Ação', entao: invalid }).success, false);
  }
});

test('cadastro limita nome a 255 caracteres e rejeita texto inválido', () => {
  const input = { email: 'qa@example.test', password: 'valid-password' };
  assert.equal(registerSchema.safeParse({ ...input, nome: 'a'.repeat(255) }).success, true);
  for (const nome of ['a'.repeat(256), 'QA\u0000', 'QA\ud800']) assert.equal(registerSchema.safeParse({ ...input, nome }).success, false);
});
