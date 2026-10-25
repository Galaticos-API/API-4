import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from '../database.mjs';
import { APP, api, closeBrowser, createProject, createHierarchy, createUser, openPage, assertNoHorizontalOverflow } from '../support.mjs';
after(()=>closeBrowser());
test('S2-16: edição real, autor/data, comparação e layout mobile',async()=>{
  const po=await createUser('po'), project=await createProject(po,'Versões QA');
  const {epic}=await createHierarchy(po,project,{epic:'Especificar fluxo original'});
  assert.equal((await api('/epics/'+epic.id,{method:'PATCH',token:po.token,body:{titulo:'Especificar fluxo atualizado'}})).status,200);
  const {page,context}=await openPage(po);
  try {
    await page.goto(`${APP}/projects/${project.id}/epics/${epic.id}`);
    const panel=page.getByRole('region',{name:'Histórico de versões'});
    await panel.getByText('Versão 2',{exact:true}).waitFor({state:'visible'});
    assert.equal(await panel.locator('time').count(),2);
    await panel.getByLabel('Versão de origem').selectOption('1');
    await panel.getByLabel('Versão de destino').selectOption('2');
    await panel.getByRole('button',{name:'Comparar versões',exact:true}).click();
    const diff=panel.getByLabel('Comparação de versões');
    await diff.getByText('Especificar fluxo original',{exact:true}).waitFor({state:'visible'});
    await diff.getByText('Especificar fluxo atualizado',{exact:true}).waitFor({state:'visible'});
    await page.getByRole('button',{name:'Novo critério',exact:true}).click();
    await page.getByLabel('Texto do critério',{exact:true}).fill('Validar o acesso ao projeto');
    await page.getByRole('button',{name:'Adicionar',exact:true}).click();
    await panel.getByText('Versão 3',{exact:true}).waitFor({state:'visible'});
    assert.equal(await panel.getByLabel('Comparação de versões').count(),0);
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Remover',exact:true}).click();
    await panel.getByText('Versão 4',{exact:true}).waitFor({state:'visible'});
    await page.setViewportSize({width:390,height:844});
    await assertNoHorizontalOverflow(page,'Comparação de versões mobile');
    const dev=await createUser('dev');
    const inaccessible=await api(`/audit/epico/${epic.id}/versions`,{token:dev.token});
    assert.equal(inaccessible.status,404);
  } finally { await context.close(); }
});

for (const kind of ['epico', 'feature', 'pbi']) {
  test('S2-12/S2-16: aproveitar, aceitar e comparar versões de ' + kind, async () => {
    const po = await createUser('po');
    const project = await createProject(po, 'Destino ' + kind);
    const sourceProject = await createProject(po, 'Origem ' + kind);
    const target = await createHierarchy(po, project);
    const source = await createHierarchy(po, sourceProject, {
      epic: 'Especificar padrão reaproveitado',
      feature: 'Detalhar padrão reaproveitado',
      pbi: 'Validar padrão reaproveitado',
    });
    const key = kind === 'epico' ? 'epic' : kind;
    await testDatabase(async db => {
      await db.query(`INSERT INTO chunk(projeto_id,entidade_tipo,entidade_id,texto,embedding)
        VALUES($1,$2,$3,$4,$5::vector)`, [sourceProject.id, kind, source[key].id, source[key].titulo, JSON.stringify(Array(1024).fill(0.1))]);
    });
    const path = `/projects/${project.id}/epics/${target.epic.id}`
      + (kind === 'epico' ? '' : `/features/${target.feature.id}`)
      + (kind === 'pbi' ? `/pbis/${target.pbi.id}` : '');
    const { page, context } = await openPage(po);
    try {
      await page.goto(APP + path);
      const versions = page.getByRole('region', { name: 'Histórico de versões' });
      await versions.getByText('Versão 1', { exact: true }).waitFor({ state: 'visible' });
      const similar = page.getByRole('complementary', { name: 'Itens semelhantes no acervo' });
      await similar.locator('.similar-toggle').click();
      await similar.locator('.similar-item').filter({ hasText: source[key].titulo })
        .getByRole('button', { name: 'Aproveitar', exact: true }).click();
      const suggestions = page.getByRole('region', { name: 'Sugestões da IA', exact: true });
      const card = suggestions.getByRole('region', { name: 'Sugestão da IA', exact: true })
        .filter({ hasText: source[key].titulo });
      await card.getByRole('button', { name: 'Aceitar', exact: true }).click();
      await versions.getByText('Versão 2', { exact: true }).waitFor({ state: 'visible' });
      await versions.getByLabel('Versão de origem').selectOption('1');
      await versions.getByLabel('Versão de destino').selectOption('2');
      await versions.getByRole('button', { name: 'Comparar versões', exact: true }).click();
      const diff = versions.getByLabel('Comparação de versões');
      await diff.getByText(target[key].titulo, { exact: true }).waitFor({ state: 'visible' });
      await diff.getByText(source[key].titulo, { exact: true }).waitFor({ state: 'visible' });
      await testDatabase(async db => {
        const relations = await db.query('SELECT count(*)::int AS n FROM reaproveitamento_item WHERE destino_id=$1 AND origem_id=$2', [target[key].id, source[key].id]);
        assert.equal(relations.rows[0].n, 1);
      });
    } finally { await context.close(); }
  });
}
