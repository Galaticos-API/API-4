import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {APP,api,closeBrowser,createHierarchy,createProject,createUser,openPage,assertNoHorizontalOverflow} from '../support.mjs';
after(()=>closeBrowser());
test('S2-20: administrador publica DoR/DoD e autor consulta por nível durante edição',async()=>{
  const admin=await createUser('admin'),po=await createUser('po');
  const path='/quality/configuration/definitions';
  const original=(await api(path,{token:admin.token})).json;
  const project=await createProject(po,'DoR e DoD');
  const {epic,feature,pbi}=await createHierarchy(po,project);
  const adminSession=await openPage(admin),author=await openPage(po);
  try {
    await adminSession.page.goto(APP+'/admin');
    const settings=adminSession.page.getByRole('region',{name:'Configuração de DoR e DoD'});
    await settings.getByRole('group',{name:'PBI',exact:true}).getByLabel('Definição de Preparado (DoR)').fill('História revisada pelo PO');
    await settings.getByRole('group',{name:'PBI',exact:true}).getByLabel('Definição de Pronto (DoD)').fill('Evidências conferidas');
    await settings.getByRole('group',{name:'Épico',exact:true}).getByLabel('Definição de Preparado (DoR)').fill('Escopo do épico definido');
    await settings.getByRole('group',{name:'Feature',exact:true}).getByLabel('Definição de Preparado (DoR)').fill('Objetivo da feature definido');
    await settings.getByRole('button',{name:'Salvar definições',exact:true}).click();
    await settings.getByText(/Definições salvas/).waitFor({state:'visible'});
    const draftField=settings.getByRole('group',{name:'PBI',exact:true}).getByLabel('Definição de Pronto (DoD)');
    await draftField.fill('Texto não salvo para testar a recarga');
    adminSession.page.once('dialog',dialog=>dialog.dismiss());
    await settings.getByRole('button',{name:'Recarregar definições',exact:true}).click();
    assert.equal(await draftField.inputValue(),'Texto não salvo para testar a recarga');
    adminSession.page.once('dialog',dialog=>dialog.accept());
    const reloaded=adminSession.page.waitForResponse(response=>response.url().endsWith('/quality/configuration/definitions')&&response.request().method()==='GET');
    await settings.getByRole('button',{name:'Recarregar definições',exact:true}).click();
    await reloaded;await draftField.waitFor({state:'visible'});
    assert.equal(await draftField.inputValue(),'Evidências conferidas');
    await adminSession.page.setViewportSize({width:390,height:844});await assertNoHorizontalOverflow(adminSession.page,'DoR/DoD mobile');
    await author.page.goto(`${APP}/projects/${project.id}/epics/${epic.id}/features/${feature.id}/pbis/${pbi.id}`);
    await author.page.getByRole('button',{name:'Editar',exact:true}).first().click();
    const panel=author.page.getByRole('region',{name:'Definições de Preparado e Pronto',exact:true});
    await panel.getByText('História revisada pelo PO',{exact:true}).waitFor({state:'visible'});
    await panel.getByText('Evidências conferidas',{exact:true}).waitFor({state:'visible'});
    assert.equal(await panel.getByText('Escopo do épico definido',{exact:true}).count(),0);
    const writing=author.page.locator('#edit-historia_eu_quero');
    await writing.fill('Texto que ainda está em edição');
    const current=(await api(path,{token:admin.token})).json;
    current.levels.pbi.dor=['História revisada novamente'];
    assert.equal((await api(path,{method:'PUT',token:admin.token,body:{expected_version:current.version,levels:current.levels}})).status,200);
    await panel.getByRole('button',{name:'Atualizar definições',exact:true}).click();
    await panel.getByText('História revisada novamente',{exact:true}).waitFor({state:'visible'});
    assert.equal(await writing.inputValue(),'Texto que ainda está em edição');
    await writing.fill(pbi.historia_eu_quero);
    for(const [route,condition] of [
      [`/projects/${project.id}/epics/new`,'Escopo do épico definido'],
      [`/projects/${project.id}/epics/${epic.id}/features/new`,'Objetivo da feature definido'],
      [`/projects/${project.id}/epics/${epic.id}/features/${feature.id}/pbis/new`,'História revisada novamente'],
    ]) {
      await author.page.goto(APP+route);
      await author.page.getByRole('region',{name:'Definições de Preparado e Pronto',exact:true}).getByText(condition,{exact:true}).waitFor({state:'visible'});
    }
    assert.equal((await api(path,{method:'PUT',token:po.token,body:{}})).status,403);
  } finally {
    const current=(await api(path,{token:admin.token})).json;
    assert.equal((await api(path,{method:'PUT',token:admin.token,body:{expected_version:current.version,levels:original.levels}})).status,200);
    await adminSession.context.close();await author.context.close();
  }
});
