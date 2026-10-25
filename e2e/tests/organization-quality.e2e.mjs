import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { APP, api, closeBrowser, createHierarchy, createProject, createUser, openPage, assertNoHorizontalOverflow } from '../support.mjs';
after(()=>closeBrowser());

test('S2-19: administração configura nível/dicionário e preserva a avaliação da conclusão',async()=>{
  const admin=await createUser('admin'),po=await createUser('po');
  const baseline=(await api('/quality/configuration/organization',{token:admin.token})).json;
  const project=await createProject(po,'Política da organização');
  const {epic,feature,pbi}=await createHierarchy(po,project,{epic:'Definir fluxo especialissimo'});
  const {page,context}=await openPage(admin);
  try {
    await page.goto(APP+'/admin');
    const settings=page.getByRole('region',{name:'Configuração de qualidade da organização'});
    const versionBefore=(await api('/quality/configuration/organization',{token:admin.token})).json.version;
    await settings.getByRole('group',{name:'Épico',exact:true}).getByLabel('Critérios de aceitação registrados').uncheck();
    await settings.getByLabel('Termos vagos (um por linha)').fill('especialissimo');
    await settings.getByRole('button',{name:'Salvar verificações',exact:true}).click();
    await settings.getByText('Configuração salva. As próximas avaliações já usam as novas verificações.').waitFor({state:'visible'});
    const updated=(await api('/quality/configuration/organization',{token:admin.token})).json;
    assert.equal(updated.version,versionBefore+1);assert.equal(updated.levels.epico.criterios_aceitacao,false);
    assert.deepEqual(updated.levels.feature,baseline.levels.feature);
    await page.setViewportSize({width:390,height:844});await assertNoHorizontalOverflow(page,'Configuração de qualidade mobile');
    assert.equal((await api(`/epics/${epic.id}/complete`,{method:'PATCH',token:po.token})).status,200);
    const poSession=await openPage(po);
    try {
      assert.equal((await api(`/pbis/${pbi.id}`,{method:'PATCH',token:po.token,body:{regras_observacoes:'Fluxo especialissimo'}})).status,200);
      await poSession.page.goto(`${APP}/projects/${project.id}/epics/${epic.id}/features/${feature.id}/pbis/${pbi.id}`);
      const vagueCheck=poSession.page.getByTestId('quality-check-termos_vagos');
      await vagueCheck.getByText(/especialissimo/).waitFor({state:'visible'});
      await vagueCheck.getByRole('button',{name:'Corrigir Ausência de termos vagos'}).click();
      assert.equal(await poSession.page.evaluate(()=>document.activeElement?.id),'regras_observacoes');
      await poSession.page.goto(`${APP}/projects/${project.id}/epics/${epic.id}`);
      const report=poSession.page.getByRole('region',{name:'Qualidade conforme a organização'});
      await report.getByText('Termos encontrados: especialissimo.',{exact:true}).waitFor({state:'visible'});
      assert.equal((await api('/quality/configuration/organization',{method:'PUT',token:po.token,body:{}})).status,403);
      await settings.getByLabel('Termos vagos (um por linha)').fill('');
      await settings.getByRole('group',{name:'Épico',exact:true}).getByLabel('Critérios de aceitação registrados').check();
      await settings.getByRole('button',{name:'Salvar verificações',exact:true}).click();
      await settings.getByText('Configuração salva. As próximas avaliações já usam as novas verificações.').waitFor({state:'visible'});
      await report.getByRole('button',{name:'Atualizar qualidade',exact:true}).click();
      await report.getByText('Este item permanece concluído por critérios anteriores. O indicador acima usa a configuração atual.').waitFor({state:'visible'});
      await report.getByText(new RegExp('Concluído com a configuração versão '+updated.version)).waitFor({state:'visible'});
      const status=(await api(`/epics/${epic.id}`,{token:po.token})).json.status;assert.equal(status,'concluido');
      assert.equal(await report.getByText('Termos encontrados: especialissimo.',{exact:true}).count(),0);
    } finally { await poSession.context.close(); }
  } finally {
    const current=(await api('/quality/configuration/organization',{token:admin.token})).json;
    const restored=await api('/quality/configuration/organization',{method:'PUT',token:admin.token,body:{expected_version:current.version,levels:baseline.levels,vague_terms:baseline.vague_terms,exigir_justificativa_item_concluido:baseline.exigir_justificativa_item_concluido}});
    assert.equal(restored.status,200);await context.close();
  }
});
