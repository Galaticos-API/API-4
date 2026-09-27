import test, { after } from "node:test";
import assert from "node:assert/strict";
import { expect } from "./expect.mjs";
import { APP, api, closeBrowser, createProject, createUser, openPage } from "../support.mjs";

after(() => closeBrowser());

test("Épico → feature → PBI pela interface: validação, qualidade em tempo real, cenário e conclusão", async () => {
  const po = await createUser("po");
  const project = await createProject(po, "Hierarquia UI");
  const { page, context } = await openPage(po);
  try {
    await page.goto(`${APP}/projects/${project.id}/epics/new`);
    await page.getByRole("button", { name: "Criar épico" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await page.getByLabel(/Título \(obrigatório\)/).fill("Épico criado pela interface");
    await page.getByRole("button", { name: "Criar épico" }).click();
    await expect(page.getByRole("heading", { name: "Épico criado pela interface" })).toBeVisible();

    await page.getByRole("button", { name: "Nova feature" }).click();
    await page.getByLabel(/Título \(obrigatório\)/).fill("Feature criada pela interface");
    await page.getByRole("button", { name: "Criar feature" }).click();
    await expect(page.getByRole("heading", { name: "Feature criada pela interface" })).toBeVisible();

    await page.getByRole("button", { name: "Novo PBI" }).click();
    const title = page.getByLabel(/Título \(obrigatório, verbo no infinitivo\)/);
    await title.fill("Login do sistema");
    await page.getByLabel(/COMO UM/).fill("usuário cadastrado");
    await page.getByLabel(/EU QUERO/).fill("entrar com e-mail e senha");
    await page.getByLabel(/PARA QUE/).fill("acessar meus projetos");
    await expect(page.getByText("Checklist de qualidade em tempo real")).toBeVisible();
    await title.fill("Validar login do sistema");
    await page.getByRole("button", { name: "Criar PBI" }).click();
    await expect(page.getByRole("heading", { name: /Validar login do sistema/ })).toBeVisible();

    await page.getByRole("button", { name: "Marcar como concluído" }).click();
    await expect(page.getByText(/Faltam preencher: Cenários de aceitação/)).toBeVisible();

    await page.getByRole("button", { name: "Novo cenário" }).click();
    await page.getByLabel("Nome do cenário").fill("Login válido");
    await page.getByLabel("DADO").fill("um usuário cadastrado");
    await page.getByLabel("QUANDO").fill("informar credenciais corretas");
    await page.getByLabel("ENTÃO").fill("o sistema abre a área interna");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByText("Login válido")).toBeVisible();

    await page.getByRole("button", { name: "Marcar como concluído" }).click();
    await expect(page.getByText(/Concluído/i).first()).toBeVisible();
  } finally {
    await context.close();
  }
  const tree = await api(`/projects/${project.id}/backlog-tree`, { token: po.token });
  assert.equal(tree.json.epics.length, 1);
  assert.equal(tree.json.epics[0].features[0].pbis[0].titulo, "Validar login do sistema");
  assert.equal(tree.json.epics[0].features[0].pbis[0].status, "concluido");
});

test("Arquivar item de backlog exige prévia e deixa o item somente leitura", async () => {
  const po = await createUser("po");
  const project = await createProject(po, "Arquivar item");
  const epic = await api("/epics", { method: "POST", token: po.token, body: { projeto_id: project.id, titulo: "Épico a arquivar" } });
  assert.equal(epic.status, 201);
  const { page, context } = await openPage(po);
  try {
    await page.goto(`${APP}/projects/${project.id}/epics/${epic.json.id}`);
    await page.getByRole("button", { name: "Arquivar item" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    assert.equal((await api(`/epics/${epic.json.id}`, { token: po.token })).json.status !== "arquivado", true);
    await page.getByRole("button", { name: "Arquivar item" }).click();
    await page.getByRole("button", { name: /Confirmar arquivamento/ }).click();
    await expect(page.getByText(/somente leitura|Arquivado em/i).first()).toBeVisible();
  } finally {
    await context.close();
  }
  assert.equal((await api(`/epics/${epic.json.id}`, { token: po.token })).json.status, "arquivado");
  assert.ok((await api("/features", { method: "POST", token: po.token, body: { epico_id: epic.json.id, titulo: "Não deve criar" } })).status >= 400);
});
