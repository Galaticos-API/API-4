import test, { after } from "node:test";
import assert from "node:assert/strict";
import { expect } from "./expect.mjs";
import { APP, api, archiveProject, assertNoHorizontalOverflow, closeBrowser, createProject, createUser, openPage, pdfContent, uploadRaw } from "../support.mjs";

after(() => closeBrowser());

const file = (name, content, mimeType = "application/octet-stream") => ({ name, mimeType, buffer: Buffer.from(content) });

test("PO envia, lista e remove documentos com confirmação e validações claras", async () => {
  const po = await createUser("po");
  const project = await createProject(po, "Docs PO");
  const { page, context } = await openPage(po);
  try {
    await page.goto(`${APP}/projects/${project.id}#documents`);
    await expect(page.getByText("Nenhum documento neste projeto")).toBeVisible();
    await expect(page.getByText(/Máximo 20,0 MB/)).toBeVisible();

    const input = page.getByLabel("Selecionar documento");

    await input.setInputFiles(file("programa.exe", "MZ"));
    await expect(page.getByText(/Formato não suportado/)).toBeVisible();

    await input.setInputFiles(file("falso.pdf", "isto é apenas texto"));
    await page.getByRole("button", { name: "Enviar documento" }).click();
    await expect(page.getByText(/não corresponde ao formato \.pdf/)).toBeVisible();
    await expect(page.getByText("falso.pdf")).toBeVisible();
    await page.getByRole("button", { name: "Limpar seleção" }).click();

    await input.setInputFiles(file("Escopo funcional.md", "# Escopo\n\nTexto."));
    await page.getByRole("button", { name: "Enviar documento" }).click();
    await expect(page.getByText(/foi armazenado/)).toBeVisible();
    const row = page.getByRole("row", { name: /Escopo funcional\.md/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Aguardando ingestão")).toBeVisible();

    await page.getByRole("button", { name: "Remover Escopo funcional.md" }).click();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(row).toBeVisible();

    await page.getByRole("button", { name: "Remover Escopo funcional.md" }).click();
    await page.keyboard.press("Escape");
    await expect(row).toBeVisible();

    await page.getByRole("button", { name: "Remover Escopo funcional.md" }).click();
    await page.getByRole("button", { name: "Confirmar remoção" }).click();
    await expect(page.getByText(/foi removido deste projeto/)).toBeVisible();
    await expect(page.getByText("Nenhum documento neste projeto")).toBeVisible();

    const list = await api(`/projects/${project.id}/documents`, { token: po.token });
    assert.equal(list.json.items.length, 0);
  } finally {
    await context.close();
  }
});

test("perfil dev consulta mas não escreve, e a API recusa a escrita", async () => {
  const po = await createUser("po");
  const dev = await createUser("dev");
  const project = await createProject(po, "Docs DEV");
  const uploaded = await uploadRaw(po, project.id, "leitura.pdf", pdfContent());
  assert.equal(uploaded.status, 201);

  const { page, context } = await openPage(dev);
  try {
    await page.goto(`${APP}/projects/${project.id}#documents`);
    await expect(page.getByRole("row", { name: /leitura\.pdf/ })).toBeVisible();
    await expect(page.getByText(/pode consultar documentos, mas não pode enviar ou remover/)).toBeVisible();
    assert.equal(await page.getByLabel("Selecionar documento").count(), 0);
    assert.equal(await page.getByRole("button", { name: /Remover/ }).count(), 0);
  } finally {
    await context.close();
  }
  assert.equal((await uploadRaw(dev, project.id, "x.pdf", pdfContent())).status, 403);
  assert.equal((await api(`/projects/${project.id}/documents/${uploaded.json.id}`, { method: "DELETE", token: dev.token })).status, 403);
});

test("projeto arquivado: UI somente leitura e API responde 409 sem alterar nada", async () => {
  const po = await createUser("po");
  const project = await createProject(po, "Docs Arquivado");
  const uploaded = await uploadRaw(po, project.id, "preservado.pdf", pdfContent());
  assert.equal(uploaded.status, 201);
  await archiveProject(po, project);

  const { page, context } = await openPage(po);
  try {
    await page.goto(`${APP}/projects/${project.id}#documents`);
    await expect(page.getByText(/Projeto arquivado: os documentos ficam disponíveis somente para consulta/)).toBeVisible();
    await expect(page.getByRole("row", { name: /preservado\.pdf/ })).toBeVisible();
    assert.equal(await page.getByLabel("Selecionar documento").count(), 0);
    assert.equal(await page.getByRole("button", { name: /Remover/ }).count(), 0);
  } finally {
    await context.close();
  }
  assert.equal((await uploadRaw(po, project.id, "novo.pdf", pdfContent())).status, 409);
  assert.equal((await api(`/projects/${project.id}/documents/${uploaded.json.id}`, { method: "DELETE", token: po.token })).status, 409);
  const list = await api(`/projects/${project.id}/documents`, { token: po.token });
  assert.deepEqual(list.json.items.map((item) => item.nome), ["preservado.pdf"]);
});

test("isolamento por projeto: listagem e remoção nunca atravessam projetos", async () => {
  const po = await createUser("po");
  const a = await createProject(po, "Isolamento A");
  const b = await createProject(po, "Isolamento B");
  const doc = await uploadRaw(po, a.id, "somente-a.pdf", pdfContent());
  assert.equal(doc.status, 201);

  assert.equal((await api(`/projects/${b.id}/documents`, { token: po.token })).json.items.length, 0);
  assert.equal((await api(`/projects/${b.id}/documents/${doc.json.id}`, { method: "DELETE", token: po.token })).status, 204);
  assert.equal((await api(`/projects/${a.id}/documents`, { token: po.token })).json.items.length, 1);
  assert.equal((await api(`/projects/00000000-0000-4000-8000-000000000000/documents`, { token: po.token })).status, 404);
  assert.equal((await api(`/projects/${a.id}/documents`)).status, 401);
});

test("limite de tamanho é aplicado no servidor mesmo sem a validação do cliente", async () => {
  const po = await createUser("po");
  const project = await createProject(po, "Docs Limite");
  const big = new Uint8Array(21 * 1024 * 1024).fill(0x61);
  const response = await uploadRaw(po, project.id, "grande.txt", big);
  assert.equal(response.status, 413);
  assert.equal(response.json.code, "PAYLOAD_TOO_LARGE");
  assert.equal((await api(`/projects/${project.id}/documents`, { token: po.token })).json.items.length, 0);
});

test("paginação por cursor carrega mais documentos sem duplicar", async () => {
  const po = await createUser("po");
  const project = await createProject(po, "Docs Paginação");
  for (let index = 0; index < 3; index += 1) assert.equal((await uploadRaw(po, project.id, `doc-${index}.txt`, `conteudo ${index}`)).status, 201);
  const first = await api(`/projects/${project.id}/documents?limit=2`, { token: po.token });
  assert.equal(first.json.items.length, 2);
  assert.ok(first.json.next_cursor);
  const second = await api(`/projects/${project.id}/documents?limit=2&cursor=${first.json.next_cursor}`, { token: po.token });
  assert.equal(second.json.items.length, 1);
  assert.equal(second.json.next_cursor, null);
  assert.equal((await api(`/projects/${project.id}/documents?cursor=%%%`, { token: po.token })).status, 400);
});

test("abas do projeto funcionam por teclado e mobile não transborda", async () => {
  const po = await createUser("po");
  const project = await createProject(po, "Abas");
  const { page, context } = await openPage(po, { width: 390, height: 844 });
  try {
    await page.goto(`${APP}/projects/${project.id}`);
    await expect(page.getByRole("tab", { name: "Visão geral" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Visão geral" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Documentos" })).toHaveAttribute("aria-selected", "true");
    assert.match(page.url(), /#documents$/);
    await assertNoHorizontalOverflow(page, "documentos mobile");
    await page.getByRole("tab", { name: "Análise de repositório" }).click();
    await assertNoHorizontalOverflow(page, "analisador mobile");
  } finally {
    await context.close();
  }
});
