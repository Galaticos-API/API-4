import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase, allocateDeveloper } from '../database.mjs';
import { expect } from './expect.mjs';
import { APP, api, closeBrowser, createProject, createUser, openPage } from '../support.mjs';
after(() => closeBrowser());
test('S2-23: aprovação humana real, proveniência, busca, navegação e autorização na UI', async () => {
    const po = await createUser('po');
    const admin = await createUser('admin');
    const dev = await createUser('dev');
    const project = await createProject(po, 'Relatório revisado');
    const other = await createProject(po, 'Outro acervo');
    await allocateDeveloper(dev, project);
    const id = randomUUID();
    const run = 'QA-223-' + id;
    await testDatabase(db => db.query(`INSERT INTO analise_repositorio(id,projeto_id,usuario_id,repositorio_url,run_id,status,relatorio_markdown)
    VALUES($1,$2,$3,'https://github.com/test/review',$4,'concluido','# Relatório QA\n\nArquitetura PostgreSQL revisada')`, [id, project.id, po.user.id, run]));
    const { page, context } = await openPage(po);
    try {
        await page.goto(`${APP}/projects/${project.id}#repo-analyzer=${id}`);
        await expect(page.getByText(/Gerado por IA e ainda não revisado/)).toBeVisible();
        const approvalResponse = page.waitForResponse(response => response.url().endsWith('/report/approve') && response.request().method() === 'POST');
        await page.getByRole('button', { name: 'Aprovar relatório e publicar no acervo' }).click();
        assert.equal((await approvalResponse).status(), 200);
        await testDatabase(async (db) => {
            const approved = (await db.query('SELECT * FROM analise_repositorio WHERE id=$1', [id])).rows[0];
            assert.equal(approved.aprovado_por, po.user.id);
            assert.ok(approved.aprovado_em);
            assert.equal(approved.indexacao_status, 'pendente');
            // Fixture do resultado do worker; o harness exercita o processamento real em serviço separado.
            await db.query(`INSERT INTO chunk(projeto_id,entidade_tipo,entidade_id,texto,metadados_json)
        VALUES($1,'analise_repositorio',$2,'Arquitetura PostgreSQL revisada',$3::jsonb)`, [project.id, id, JSON.stringify({ run_id: run, source_name: 'https://github.com/test/review', provenance: 'ai-accepted' })]);
            await db.query("UPDATE analise_repositorio SET indexacao_status='indexado' WHERE id=$1", [id]);
        });
        await page.goto(`${APP}/knowledge`);
        await page.getByRole('option', { name: project.nome, exact: true }).waitFor({ state: 'attached' });
        await page.getByLabel('Escopo do projeto').selectOption(project.id);
        await page.getByLabel('Pesquisar no acervo').fill('Arquitetura PostgreSQL');
        await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
        await expect(page.getByText('Relatório de IA revisado · Execução: ' + run)).toBeVisible();
        await expect(page.locator('.knowledge-excerpt').filter({ hasText: 'Arquitetura PostgreSQL revisada' })).toBeVisible();
        await page.getByRole('link', { name: 'Abrir origem' }).click();
        await expect(page.getByRole('heading', { name: 'Relatório QA', exact: true })).toBeVisible();
        assert.ok(page.url().endsWith('#repo-analyzer=' + id));
        const isolated = await api(`/search?q=Arquitetura&projeto_id=${other.id}`, { token: po.token });
        assert.equal(isolated.status, 200);
        assert.equal(isolated.json.items.some(hit => hit.entity_id === id), false);
    }
    finally {
        await context.close();
    }
    for (const account of [admin, dev]) {
        const browser = await openPage(account);
        try {
            await browser.page.goto(`${APP}/projects/${project.id}#repo-analyzer=${id}`);
            await expect(browser.page.getByRole('heading', { name: 'Relatório QA', exact: true })).toBeVisible();
            assert.equal(await browser.page.getByRole('button', { name: 'Reprocessar relatório' }).count(), account === admin ? 1 : 0);
        }
        finally {
            await browser.context.close();
        }
    }
    assert.equal((await api(`/projects/${project.id}/repo-analyses/${id}/indexing/retry`, { token: dev.token, method: 'POST', body: {} })).status, 403);
    await testDatabase(db => db.query("UPDATE analise_repositorio SET relatorio_markdown='Nova versão sem revisão' WHERE id=$1", [id]));
    const revoked = await api(`/search?q=Arquitetura&projeto_id=${project.id}`, { token: po.token });
    assert.equal(revoked.json.items.some(hit => hit.entity_id === id), false);
});
