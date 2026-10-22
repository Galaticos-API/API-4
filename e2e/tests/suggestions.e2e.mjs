import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { allocateDeveloper, testDatabase } from '../database.mjs';
import { expect } from './expect.mjs';
import { APP, api, closeBrowser, createHierarchy, createProject, createUser, openPage } from '../support.mjs';

after(() => closeBrowser());
test('S2-13/S2-14: aceite, edição e descarte explícitos, papel autorizado e proveniência sem IA', async () => {
  const po = await createUser('po');
  const dev = await createUser('dev');
  const project = await createProject(po, 'Governança IA');
  await allocateDeveloper(dev, project);
  const { epic, feature, pbi } = await createHierarchy(po, project);
  const root = `/pbis/${pbi.id}/suggestions`;
  const suggestions = [];
  for (const [campo, valor_sugerido] of [['titulo', 'Consultar saldo validado'], ['historia_eu_quero', 'consultar o saldo'], ['historia_para_que', 'texto a descartar']]) {
    const result = await api(root, { method: 'POST', token: po.token, body: { campo, valor_sugerido, origem: 'qa-harness' } });
    assert.equal(result.status, 201);
    suggestions.push(result.json);
  }
  const path = `${APP}/projects/${project.id}/epics/${epic.id}/features/${feature.id}/pbis/${pbi.id}`;
  const developer = await openPage(dev);
  try {
    await developer.page.goto(path);
    const panel = developer.page.getByRole('region', { name: 'Sugestões da IA', exact: true });
    await expect(panel.getByText('Consultar saldo validado', { exact: true })).toBeVisible();
    assert.equal(await panel.getByRole('button', { name: 'Aceitar', exact: true }).count(), 0);
    for (const action of ['accept', 'edit', 'discard']) {
      assert.equal((await api(`${root}/${suggestions[0].id}/${action}`, { method: 'POST', token: dev.token, body: { valor: 'negado' } })).status, 403);
    }
  } finally { await developer.context.close(); }
  const { page, context } = await openPage(po);
  try {
    await page.goto(path);
    const panel = page.getByRole('region', { name: 'Sugestões da IA', exact: true });
    const cards = panel.getByRole('region', { name: 'Sugestão da IA', exact: true });
    const accept = page.waitForResponse(response => response.url().endsWith('/accept') && response.request().method() === 'POST');
    await cards.filter({ hasText: 'Consultar saldo validado' }).getByRole('button', { name: 'Aceitar', exact: true }).click();
    assert.equal((await accept).status(), 200);
    await cards.filter({ hasText: 'consultar o saldo' }).getByRole('button', { name: 'Editar antes de aceitar' }).click();
    await panel.getByLabel('Valor editado', { exact: true }).fill('consultar o saldo atualizado');
    const edit = page.waitForResponse(response => response.url().endsWith('/edit') && response.request().method() === 'POST');
    await panel.getByRole('button', { name: 'Confirmar edição' }).click();
    assert.equal((await edit).status(), 200);
    const discard = page.waitForResponse(response => response.url().endsWith('/discard') && response.request().method() === 'POST');
    await cards.filter({ hasText: 'texto a descartar' }).getByRole('button', { name: 'Descartar', exact: true }).click();
    assert.equal((await discard).status(), 200);
    await testDatabase(async db => {
      const row = (await db.query('SELECT * FROM pbi WHERE id=$1', [pbi.id])).rows[0];
      assert.equal(row.titulo, 'Consultar saldo validado');
      assert.equal(row.historia_eu_quero, 'consultar o saldo atualizado');
      assert.equal(row.historia_para_que, pbi.historia_para_que);
      assert.equal(row.provenance_json.titulo, 'ai-accepted');
      assert.equal(row.provenance_json.historia_eu_quero, 'ai-edited');
      const saved = (await db.query('SELECT status,resolvido_por,origem FROM sugestao_ia WHERE entidade_id=$1 ORDER BY campo', [pbi.id])).rows;
      assert.equal(saved.length, 3);
      assert.ok(saved.every(item => item.resolvido_por === po.user.id && item.origem === 'qa-harness'));
      assert.deepEqual(new Set(saved.map(item => item.status)), new Set(['aceita', 'editada', 'descartada']));
    });
    const unavailable = await api(`/projects/${project.id}/ai/requests`, { method: 'POST', token: po.token,
      body: { mode: 'levantamento', operation: 'questionar', level: 'pbi', fields: { titulo: 'Consultar saldo' } } });
    assert.equal(unavailable.status, 503);
    await page.reload();
    await expect(page.getByRole('heading', { name: /Consultar saldo validado/ })).toBeVisible();
  } finally { await context.close(); }
});
