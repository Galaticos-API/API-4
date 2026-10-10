import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { APP, getBrowser, closeBrowser, createUser } from '../support.mjs';
import { expect } from './expect.mjs';
after(closeBrowser);

test('login pela tela restaura sessão e cadastro público cria somente dev', async () => {
  const account = await createUser('dev');
  const context = await (await getBrowser()).newContext();
  try {
    const page = await context.newPage();
    await page.goto(`${APP}/login`);
    await page.getByLabel('E-mail', {exact:true}).fill(account.email);
    await page.getByLabel('Senha', {exact:true}).fill(account.password);
    const login = page.waitForResponse(r=>r.url().endsWith('/auth/login') && r.request().method()==='POST');
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    assert.equal((await login).status(),200);
    await page.goto(`${APP}/projects`);
    await expect(page.getByRole('heading',{name:'Projetos',exact:true})).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading',{name:'Projetos',exact:true})).toBeVisible();
  } finally { await context.close(); }
  const anonymous = await (await getBrowser()).newContext();
  try {
    const page = await anonymous.newPage();
    await page.goto(`${APP}/login`);
    await page.getByRole('button',{name:'Cadastrar',exact:true}).click();
    await page.getByLabel('Nome Completo', {exact:true}).fill('Pessoa E2E');
    await page.getByLabel('E-mail Corporativo', {exact:true}).fill(`ui-${randomUUID()}@e2e.test`);
    await page.getByLabel('Senha (mínimo 6 caracteres)', {exact:true}).fill('Senha-forte-123');
    await page.getByLabel(/Confirmar senha/i).fill('Senha-forte-123');
    const registered = page.waitForResponse(r=>r.url().endsWith('/auth/register') && r.request().method()==='POST');
    await page.getByRole('button',{name:'Cadastrar e Entrar',exact:true}).click();
    const response = await registered;
    assert.equal(response.status(),201);
    assert.equal((await response.json()).user.role,'dev');
  } finally { await anonymous.close(); }
});
