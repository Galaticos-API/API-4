import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from '../database.mjs';
import { expect } from './expect.mjs';
import { APP, api, closeBrowser, createProject, createUser, openPage, uploadRaw } from '../support.mjs';

after(() => closeBrowser());
test('S2-05: expurgo autenticado exige confirmação, cancela relatórios e preserva outro projeto', async () => {
  const admin = await createUser('admin');
  const po = await createUser('po');
  const project = await createProject(admin, 'Expurgo QA');
  const other = await createProject(admin, 'Contexto preservado');
  const documents = [];
  for (const item of [project, other]) {
    const uploaded = await uploadRaw(admin, item.id, 'Contexto.md', '# Contexto\n\nPagamento PIX.');
    assert.equal(uploaded.status, 201);
    documents.push(uploaded.json.id);
    await testDatabase(async db => {
      await db.query("UPDATE documento SET status_processamento='processado' WHERE id=$1", [uploaded.json.id]);
      await db.query("INSERT INTO chunk(projeto_id,entidade_tipo,entidade_id,texto,metadados_json) VALUES($1,'documento',$2,'Pagamento PIX',$3::jsonb)", [item.id, uploaded.json.id, JSON.stringify({ source_locator: 'DOC-23' })]);
    });
  }
  const analysis = randomUUID();
  await testDatabase(db => db.query("INSERT INTO analise_repositorio(id,projeto_id,usuario_id,repositorio_url,run_id,status,relatorio_markdown) VALUES($1,$2,$3,'https://github.com/test/purge',$4,'concluido','# Relatório pendente')", [analysis, project.id, admin.user.id, 'run-' + analysis]));
  assert.equal((await api(`/projects/${project.id}/repo-analyses/${analysis}/report/approve`, { method: 'POST', token: admin.token, body: { relatorio_revisao: 1 } })).status, 200);
  assert.equal((await api(`/admin/projects/${project.id}/purge`, { method: 'POST', token: po.token, body: { confirmacao_nome: project.nome } })).status, 403);
  const { page, context } = await openPage(admin);
  try {
    await page.goto(`${APP}/admin`);
    await page.getByRole('option', { name: project.nome, exact: true }).first().waitFor({ state: 'attached' });
    await page.getByLabel('Projeto para expurgo').selectOption(project.id);
    const button = page.getByRole('button', { name: 'Expurgar contexto do projeto', exact: true });
    assert.equal(await button.isDisabled(), true);
    await page.locator('#purge-confirm-name').fill('Nome errado');
    assert.equal(await button.isDisabled(), true);
    await page.locator('#purge-confirm-name').fill(project.nome);
    const response = page.waitForResponse(item => item.url().endsWith(`/admin/projects/${project.id}/purge`) && item.request().method() === 'POST');
    await button.click();
    assert.equal((await response).status(), 200);
    await expect(page.getByText(/Contexto indexado do projeto expurgado com sucesso/)).toBeVisible();
    assert.equal((await api(`/projects/${project.id}/repo-analyses/${analysis}/report/approve`, { method: 'POST', token: admin.token, body: { relatorio_revisao: 1 } })).status, 409);
    await testDatabase(async db => {
      assert.equal((await db.query('SELECT count(*)::int AS n FROM chunk WHERE projeto_id=$1', [project.id])).rows[0].n, 0);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM chunk WHERE projeto_id=$1', [other.id])).rows[0].n, 1);
      const report = (await db.query('SELECT aprovacao_hash,indexacao_status,indexacao_lease_id FROM analise_repositorio WHERE id=$1', [analysis])).rows[0];
      assert.deepEqual(report, { aprovacao_hash: null, indexacao_status: 'aguardando_aprovacao', indexacao_lease_id: null });
      assert.equal((await db.query('SELECT status_processamento FROM documento WHERE id=$1', [documents[0]])).rows[0].status_processamento, 'falha');
      assert.equal((await db.query("SELECT count(*)::int AS n FROM auditoria WHERE entidade_id=$1 AND acao='EXPURGAR_CONTEXTO'", [project.id])).rows[0].n, 1);
    });
    await page.goto(`${APP}/knowledge`);
    await page.getByRole('option', { name: project.nome, exact: true }).waitFor({ state: 'attached' });
    await page.getByLabel('Escopo do projeto').selectOption(project.id);
    await page.getByLabel('Pesquisar no acervo').fill('DOC-23');
    await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Nenhum resultado encontrado' })).toBeVisible();
    await page.getByLabel('Escopo do projeto').selectOption(other.id);
    await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Abrir documento no trecho' })).toBeVisible();
  } finally { await context.close(); }
});
