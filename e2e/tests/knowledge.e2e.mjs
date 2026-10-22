import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from '../database.mjs';
import { expect } from './expect.mjs';
import { APP, api, closeBrowser, createProject, createUser, openPage, uploadRaw } from '../support.mjs';
after(() => closeBrowser());
test('S2-08: trecho e fonte, isolamento e exclusão do documento na UI autenticada', async () => {
    const po = await createUser('po');
    const project = await createProject(po, 'Busca isolada');
    const other = await createProject(po, 'Acervo sem documento');
    const uploaded = await uploadRaw(po, project.id, 'Especificacao QA.md', '# Integração\n\nConfirmar o pagamento PIX.');
    assert.equal(uploaded.status, 201);
    const chunkId = randomUUID();
    await testDatabase(async (db) => {
        await db.query("UPDATE documento SET status_processamento='processado' WHERE id=$1", [uploaded.json.id]);
        await db.query(`INSERT INTO chunk(id,projeto_id,entidade_tipo,entidade_id,texto,metadados_json)
      VALUES($1,$2,'documento',$3,'Confirmar o pagamento PIX no projeto de origem.',$4::jsonb)`, [chunkId, project.id, uploaded.json.id, JSON.stringify({ chunk_index: 0, source_name: 'Especificacao QA.md', source_locator: 'DOC-23' })]);
    });
    const { page, context } = await openPage(po);
    try {
        await page.goto(`${APP}/knowledge`);
        await page.getByRole('option', { name: project.nome, exact: true }).waitFor({ state: 'attached' });
        await page.getByLabel('Escopo do projeto').selectOption(other.id);
        await page.getByLabel('Pesquisar no acervo').fill('DOC-23');
        await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Nenhum resultado encontrado' })).toBeVisible();
        await page.getByLabel('Escopo do projeto').selectOption(project.id);
        await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
        await expect(page.locator('.knowledge-excerpt').filter({ hasText: 'Confirmar o pagamento PIX' })).toBeVisible();
        await expect(page.getByText('Projeto: ' + project.nome, { exact: true })).toBeVisible();
        await expect(page.getByText('Documento de origem: Especificacao QA.md', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Abrir documento no trecho' }).click();
        await expect(page.getByRole('heading', { name: 'Trecho 1 · Resultado selecionado' })).toBeVisible();
        assert.equal(await page.locator('#source-chunk-' + chunkId).evaluate(node => node === document.activeElement), true);
        await page.getByRole('button', { name: 'Fechar documento' }).click();
        assert.equal((await api(`/projects/${project.id}/documents/${uploaded.json.id}`, { method: 'DELETE', token: po.token })).status, 204);
        await page.getByRole('button', { name: 'Abrir documento no trecho' }).click();
        await expect(page.getByText('O documento não está disponível. Ele pode ter sido removido ou reprocessado.')).toBeVisible();
        await page.getByRole('button', { name: 'Fechar documento' }).click();
        await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Nenhum resultado encontrado' })).toBeVisible();
    }
    finally {
        await context.close();
    }
});
