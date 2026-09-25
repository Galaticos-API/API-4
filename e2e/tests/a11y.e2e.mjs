import test, { after } from "node:test";
import assert from "node:assert/strict";
import { APP, addScenario, api, closeBrowser, createHierarchy, createProject, createUser, formatViolations, getBrowser, openPage, runAxe, uploadRaw, pdfContent } from "../support.mjs";

after(() => closeBrowser());

async function scan(page, label, prepare) {
  if (prepare) await prepare();
  await page.waitForTimeout(500);
  return runAxe(page, label);
}

test("axe (WCAG 2 A/AA): nenhuma violação crítica ou séria nas telas principais", async () => {
  const po = await createUser("po");
  const project = await createProject(po, "Acessibilidade");
  const { epic, feature, pbi } = await createHierarchy(po, project);
  await addScenario(po, pbi.id);
  await uploadRaw(po, project.id, "escopo.pdf", pdfContent());
  await api(`/projects/${project.id}/decisions`, { method: "POST", token: po.token, body: { titulo: "Decisão de exemplo", contexto: "c", decisao: "d", justificativa: "j" } });

  const reports = [];
  const anonymous = await (await getBrowser()).newContext({ viewport: { width: 1280, height: 800 } });
  const loginPage = await anonymous.newPage();
  await loginPage.goto(`${APP}/login`);
  await loginPage.getByRole("button", { name: /Entrar/ }).first().waitFor();
  reports.push(await runAxe(loginPage, "login"));
  await anonymous.close();

  const { page, context } = await openPage(po);
  try {
    await page.goto(`${APP}/projects`);
    reports.push(await scan(page, "lista de projetos", () => page.getByText(project.nome).first().waitFor()));

    await page.goto(`${APP}/projects/${project.id}`);
    reports.push(await scan(page, "projeto: visão geral", () => page.getByRole("tab", { name: "Visão geral" }).waitFor()));
    const ready = {
      Backlog: () => page.getByRole("list", { name: "Hierarquia do backlog" }).waitFor(),
      Decisões: () => page.getByText("Decisão de exemplo").first().waitFor(),
      Documentos: () => page.getByText("escopo.pdf").first().waitFor(),
      "Análise de repositório": () => page.getByLabel(/URL do repositório/).waitFor(),
    };
    for (const [tab, wait] of Object.entries(ready)) {
      await page.getByRole("tab", { name: tab }).click();
      reports.push(await scan(page, `projeto: ${tab}`, wait));
    }

    await page.goto(`${APP}/projects/${project.id}/epics/${epic.id}/features/${feature.id}/pbis/${pbi.id}`);
    reports.push(await scan(page, "PBI: detalhe", () => page.getByText("Login válido").first().waitFor()));
    await page.goto(`${APP}/chat`);
    reports.push(await scan(page, "chat", () => page.getByLabel("Sua pergunta").waitFor()));
    await page.goto(`${APP}/knowledge`);
    reports.push(await scan(page, "conhecimento", () => page.waitForTimeout(300)));
  } finally {
    await context.close();
  }

  const report = reports.map(formatViolations).filter(Boolean).join("\n");
  if (process.env.E2E_A11Y_VERBOSE) {
    for (const item of reports) console.log(`# ${item.label}: ${item.all.length} violação(ões) total, ${item.blocking.length} bloqueante(s)`);
  }
  assert.equal(report, "", `Violações de acessibilidade:\n${report}`);
});

test("foco visível e operação por teclado nos controles críticos", async () => {
  const po = await createUser("po");
  const project = await createProject(po, "Teclado");
  const { page, context } = await openPage(po);
  try {
    await page.goto(`${APP}/projects/${project.id}#documents`);
    await page.getByRole("tab", { name: "Documentos" }).waitFor();
    const controls = [page.getByRole("tab", { name: "Backlog" }), page.getByRole("button", { name: "Escolher arquivo" }), page.getByRole("button", { name: "Atualizar" })];
    for (const control of controls) {
      await page.keyboard.press("Shift");
      await control.focus();
      const style = await control.evaluate((element) => {
        const computed = getComputedStyle(element);
        return { visible: element.matches(":focus-visible"), outline: computed.outlineStyle, width: parseFloat(computed.outlineWidth), shadow: computed.boxShadow };
      });
      assert.ok(style.visible, "o controle deve receber :focus-visible por teclado");
      assert.ok((style.outline !== "none" && style.width > 0) || style.shadow !== "none", `sem indicador de foco visível: ${JSON.stringify(style)}`);
    }

    await page.goto(`${APP}/projects/new`);
    await page.getByLabel("Nome do projeto").focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    const alerts = await page.getByRole("alert").allTextContents();
    assert.ok(alerts.some((text) => /nome|cliente/i.test(text)), "erro compreensível anunciado como alerta");
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("name"));
    assert.equal(focused, "nome", "foco vai ao primeiro campo inválido");
  } finally {
    await context.close();
  }
});
