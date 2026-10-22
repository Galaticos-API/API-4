import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { APP, createUser, openPage, closeBrowser, assertNoHorizontalOverflow } from '../support.mjs';

after(() => closeBrowser());

for (const role of ['admin', 'po', 'dev']) {
  test('Menu mobile: acesso administrativo para ' + role, async () => {
    const account = await createUser(role);
    const { page, context } = await openPage(account);
    try {
      await page.goto(APP + '/projects');
      await page.getByRole('button', { name: 'Projetos', exact: true }).waitFor({ state: 'visible' });
      const adminAction = page.getByRole('button', { name: 'Abrir administração', exact: true });
      assert.equal(await adminAction.count(), role === 'admin' ? 1 : 0);
      await page.setViewportSize({ width: 390, height: 640 });
      await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
      const menu = page.locator('.mobile-menu-overlay');
      await menu.waitFor({ state: 'visible' });
      const mobileAdmin = menu.getByRole('button', { name: 'Abrir administração', exact: true });
      assert.equal(await mobileAdmin.count(), role === 'admin' ? 1 : 0);
      await assertNoHorizontalOverflow(page, role + ' no menu mobile');
      if (role === 'admin') {
        await mobileAdmin.click();
        await page.waitForURL('**/admin');
        await menu.waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => document.body.style.position), '');
        await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
        assert.equal(await mobileAdmin.getAttribute('aria-current'), 'page');
      }
      await page.keyboard.press('Escape');
      await menu.waitFor({ state: 'hidden' });
      assert.equal(await page.getByRole('button', { name: 'Abrir menu', exact: true }).evaluate(node => node === document.activeElement), true);
      if (role !== 'admin') {
        await page.goto(APP + '/admin');
        await page.getByRole('heading', { name: 'Acesso restrito', exact: true }).waitFor({ state: 'visible' });
      }
    } finally {
      await context.close();
    }
  });
}
