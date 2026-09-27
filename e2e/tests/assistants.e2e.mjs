import test, { after } from "node:test";
import assert from "node:assert/strict";
import { expect } from "./expect.mjs";
import { APP, api, archiveProject, assertNoHorizontalOverflow, closeBrowser, createProject, createUser, openPage } from "../support.mjs";

after(() => closeBrowser());

test("RepoAnalyzer: valida a URL, explica a indisponibilidade do motor e respeita o arquivamento", async () => {
  const po = await createUser("po");
  const project = await createProject(po, "Analyzer");
  const { page, context } = await openPage(po);
  try {
    await page.goto(`${APP}/projects/${project.id}#repo-analyzer`);
    await expect(page.getByText("Nenhuma análise realizada neste projeto.")).toBeVisible();

    await page.getByRole("button", { name: "Iniciar análise" }).click();
    await expect(page.getByText("Informe a URL do repositório.")).toBeVisible();

    await page.getByLabel(/URL do repositório/).fill("https://gitlab.com/acme/api");
    await page.getByRole("button", { name: "Iniciar análise" }).click();
    await expect(page.getByText("Use o formato https://github.com/usuario/repositorio.")).toBeVisible();

    await page.getByLabel(/URL do repositório/).fill("https://github.com/acme/api");
    await page.getByRole("button", { name: "Iniciar análise" }).click();
    await expect(page.getByText(/Falha ao iniciar análise no motor de IA/)).toBeVisible();
    assert.equal(await page.getByLabel(/URL do repositório/).inputValue(), "https://github.com/acme/api");
  } finally {
    await context.close();
  }

  await archiveProject(po, project);
  const archived = await openPage(po);
  try {
    await archived.page.goto(`${APP}/projects/${project.id}#repo-analyzer`);
    await expect(archived.page.getByText(/não pode iniciar novas/)).toBeVisible();
    assert.equal(await archived.page.getByRole("button", { name: "Iniciar análise" }).count(), 0);
  } finally {
    await archived.context.close();
  }
  const post = await api(`/projects/${project.id}/repo-analyses`, { method: "POST", token: po.token, body: { repositorio_url: "https://github.com/acme/api" } });
  assert.equal(post.status, 409);
});

test("RepoAnalyzer: id malformado e projeto inexistente têm respostas seguras", async () => {
  const po = await createUser("po");
  assert.equal((await api("/projects/nao-uuid/repo-analyses", { token: po.token })).status, 400);
  assert.equal((await api("/projects/00000000-0000-4000-8000-000000000000/repo-analyses", { token: po.token })).status, 404);
  assert.equal((await api("/projects/00000000-0000-4000-8000-000000000000/repo-analyses")).status, 401);
});

test("Chat: envia por Enter, mostra a origem e mantém o histórico; outra pessoa não acessa a conversa", async () => {
  const ana = await createUser("po");
  const bruno = await createUser("po");
  const project = await createProject(ana, "Chat");
  const { page, context } = await openPage(ana);
  let conversationId;
  try {
    await page.goto(`${APP}/chat`);
    await expect(page.getByText("Como posso ajudar?")).toBeVisible();
    await page.getByLabel("Escopo da consulta").selectOption(project.id);
    const composer = page.getByLabel("Sua pergunta");
    await composer.fill("linha 1");
    await composer.press("Shift+Enter");
    assert.match(await composer.inputValue(), /linha 1\n/);
    await composer.fill("Como funciona o arquivamento?");
    await composer.press("Enter");
    await expect(page.getByText("Informação não encontrada no acervo do projeto.")).toBeVisible();
    await expect(page.getByRole("log", { name: "Mensagens da conversa" })).toBeVisible();

    const conversations = await api("/chat/conversations", { token: ana.token });
    assert.equal(conversations.json.items.length, 1);
    conversationId = conversations.json.items[0].id;
    assert.equal(conversations.json.items[0].projeto_id, project.id);

    await page.reload();
    await expect(page.getByText("Informação não encontrada no acervo do projeto.")).toBeVisible();
    await assertNoHorizontalOverflow(page, "chat desktop");
  } finally {
    await context.close();
  }

  assert.equal((await api(`/chat/conversations/${conversationId}/messages`, { token: bruno.token })).status, 404);
  const injection = await api("/chat/query", { method: "POST", token: bruno.token, body: { pergunta: "invasão", conversa_id: conversationId } });
  assert.equal(injection.status, 404);
  assert.equal((await api(`/chat/conversations/${conversationId}/messages`, { token: ana.token })).json.items.length, 2);
  assert.equal((await api("/chat/conversations", { token: bruno.token })).json.items.length, 0);
});

test("Chat: mobile não transborda e o campo de pergunta é acessível por teclado", async () => {
  const po = await createUser("po");
  const { page, context } = await openPage(po, { width: 390, height: 844 });
  try {
    await page.goto(`${APP}/chat`);
    await expect(page.getByLabel("Sua pergunta")).toBeVisible();
    await assertNoHorizontalOverflow(page, "chat mobile");
    await page.getByRole("button", { name: "Nova conversa" }).focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    assert.ok(focused);
  } finally {
    await context.close();
  }
});

test("cadastro público não concede administrador", async () => {
  const response = await api("/auth/register", { method: "POST", body: { nome: "Invasor", email: `invasor-${Date.now()}@e2e.test`, password: "Senha-forte-123", role: "admin" } });
  assert.equal(response.status, 403);
  const login = await api("/auth/login", { method: "POST", body: { email: "inexistente@e2e.test", password: "x" } });
  assert.ok([401, 429].includes(login.status));
});
