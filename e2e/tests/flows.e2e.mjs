import test, { after } from "node:test";
import assert from "node:assert/strict";
import { expect } from "./expect.mjs";
import { APP, addScenario, api, archiveProject, closeBrowser, createHierarchy, createProject, createUser, openPage } from "../support.mjs";

after(() => closeBrowser());

test("Projetos: formulário valida, cria, recusa duplicidade e perfil dev não cria", async () => {
  const po = await createUser("po");
  const dev = await createUser("dev");
  const name = `Projeto E2E ${Date.now()}`;
  const { page, context } = await openPage(po);
  try {
    await page.goto(`${APP}/projects/new`);
    await page.getByRole("button", { name: "Criar projeto" }).click();
    await expect(page.getByText("Informe o nome do projeto.")).toBeVisible();
    await expect(page.getByText("Informe o cliente.")).toBeVisible();

    await page.getByLabel("Nome do projeto").fill(name);
    await page.getByLabel("Cliente").fill("Cliente E2E");
    await page.getByRole("button", { name: "Criar projeto" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    await page.goto(`${APP}/projects/new`);
    await page.getByLabel("Nome do projeto").fill(name);
    await page.getByLabel("Cliente").fill("Cliente E2E");
    await page.getByRole("button", { name: "Criar projeto" }).click();
    await expect(page.getByText("Este nome já está em uso por um projeto ativo.")).toBeVisible();
  } finally {
    await context.close();
  }

  const denied = await openPage(dev);
  try {
    await denied.page.goto(`${APP}/projects/new`);
    await expect(denied.page.getByText("Seu perfil não permite criar projetos.")).toBeVisible();
  } finally {
    await denied.context.close();
  }
  assert.equal((await api("/projects", { method: "POST", token: dev.token, body: { nome: "Negado", cliente: "X" } })).status, 403);
  assert.equal((await api("/projects")).status, 401);
});

test("Projeto: arquivamento com prévia deixa o projeto somente leitura em todas as áreas", async () => {
  const po = await createUser("po");
  const project = await createProject(po, "Arquivar");
  const { page, context } = await openPage(po);
  try {
    await page.goto(`${APP}/projects/${project.id}`);
    await page.getByRole("button", { name: "Arquivar projeto" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar arquivamento" }).click();
    await expect(page.getByText(/Somente leitura/)).toBeVisible();
  } finally {
    await context.close();
  }
  assert.equal((await api("/epics", { method: "POST", token: po.token, body: { projeto_id: project.id, titulo: "Não deve criar" } })).status >= 400, true);
  const decision = await api(`/projects/${project.id}/decisions`, { method: "POST", token: po.token, body: { titulo: "Bloqueada", contexto: "c", decisao: "d", justificativa: "j" } });
  assert.equal(decision.status, 409);
});

test("Hierarquia, critérios e qualidade: navegar da árvore ao PBI, breadcrumb e pontuação", async () => {
  const po = await createUser("po");
  const project = await createProject(po, "Hierarquia");
  const { epic, feature, pbi } = await createHierarchy(po, project);
  const before = await api(`/quality/pbis/${pbi.id}/quality`, { token: po.token });
  assert.equal(before.status, 200);
  const scenario = await addScenario(po, pbi.id);
  assert.equal(scenario.status, 201);
  const after = await api(`/quality/pbis/${pbi.id}/quality`, { token: po.token });
  assert.ok(after.json.score_completude > before.json.score_completude, "o cenário estruturado aumenta a pontuação de completude");
  assert.ok(after.json.checks.find((check) => check.check_id === "cenario_estruturado")?.passed);
  const scenarios = await api(`/criteria?entidade_tipo=pbi&entidade_id=${pbi.id}`, { token: po.token });
  assert.equal(scenarios.json.items.length, 1);

  const { page, context } = await openPage(po);
  try {
    await page.goto(`${APP}/projects/${project.id}#backlog`);
    await page.getByRole("button", { name: `Expandir épico ${epic.titulo}` }).click();
    await page.getByRole("button", { name: `Expandir feature ${feature.titulo}` }).click();
    await expect(page.getByText(pbi.titulo)).toBeVisible();
    await page.goto(`${APP}/projects/${project.id}/epics/${epic.id}/features/${feature.id}/pbis/${pbi.id}`);
    await expect(page.getByRole("navigation", { name: /Breadcrumb|Caminho|Você está em/i })).toBeVisible();
    await expect(page.getByText("Login válido")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("Busca S1-17: título, descrição, filtros combinados, isolamento, vazio e persistência", async () => {
  const po = await createUser("po");
  const projectA = await createProject(po, "Busca A");
  const projectB = await createProject(po, "Busca B");
  const a = await createHierarchy(po, projectA, { pbi: "Recuperar senha por e-mail" });
  await createHierarchy(po, projectB, { epic: "Épico de autenticação", feature: "Sessão do usuário", pbi: "Recuperar senha por e-mail" });

  const api1 = await api(`/projects/${projectA.id}/backlog-search?q=${encodeURIComponent("autenticacao")}`, { token: po.token });
  assert.equal(api1.status, 200);
  assert.ok(api1.json.items.some((item) => item.id === a.epic.id));
  assert.ok(api1.json.items.every((item) => item.caminho[0].id === a.epic.id), "somente itens do projeto A");
  const byDescription = await api(`/projects/${projectA.id}/backlog-search?q=${encodeURIComponent("acessar meus projetos")}`, { token: po.token });
  assert.deepEqual(byDescription.json.items.map((item) => item.id), [a.pbi.id]);
  assert.equal(byDescription.json.items[0].campo, "descricao");

  const { page, context } = await openPage(po);
  try {
    await page.goto(`${APP}/projects/${projectA.id}#backlog`);
    await page.getByLabel(/Buscar no backlog/).fill("recuperar senha");
    const results = page.getByRole("region", { name: "Resultados da busca no backlog" });
    await expect(results).toBeVisible();
    await expect(results.getByText("Recuperar", { exact: false }).first()).toBeVisible();
    await expect(results.getByRole("navigation", { name: /Caminho de/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("region", { name: "Resultados da busca no backlog" })).toBeVisible();
    assert.equal(await page.getByLabel(/Buscar no backlog/).inputValue(), "recuperar senha");

    await page.getByLabel(/Buscar no backlog/).fill("inexistenteabc");
    await expect(page.getByText("Nenhum item encontrado")).toBeVisible();
    await page.getByRole("button", { name: "Limpar critérios" }).click();
    await expect(page.getByRole("list", { name: "Hierarquia do backlog" })).toBeVisible();
    assert.equal(await page.getByLabel(/Buscar no backlog/).inputValue(), "");
  } finally {
    await context.close();
  }
});

test("Decisões S1-18: registrar no PBI, ver herança do projeto e restrições por perfil e arquivamento", async () => {
  const po = await createUser("po");
  const dev = await createUser("dev");
  const project = await createProject(po, "Decisões");
  const { epic, feature, pbi } = await createHierarchy(po, project);
  const inherited = await api(`/projects/${project.id}/decisions`, { method: "POST", token: po.token, body: { titulo: "Stack única em TypeScript", contexto: "Equipe pequena", decisao: "Usar TypeScript em todo o código", justificativa: "Reduz troca de contexto", alternativas: "Python no backend" } });
  assert.equal(inherited.status, 201);

  const url = `${APP}/projects/${project.id}/epics/${epic.id}/features/${feature.id}/pbis/${pbi.id}`;
  const { page, context } = await openPage(po);
  try {
    await page.goto(url);
    await expect(page.getByText("Herdadas dos níveis acima (1)")).toBeVisible();
    await expect(page.getByText(/Herdada · Projeto/)).toBeVisible();
    await page.getByRole("button", { name: "Registrar decisão" }).click();
    await page.getByRole("button", { name: "Registrar decisão" }).last().click();
    await expect(page.getByText("Informe um título com ao menos 3 caracteres.")).toBeVisible();
    await page.getByLabel("Título").fill("Hash de senha com scrypt");
    await page.getByLabel("Contexto").fill("Senhas precisam de proteção");
    await page.getByLabel(/^Decisão$/).fill("Usar scrypt com salt por usuário");
    await page.getByLabel("Justificativa").fill("Resistente a ataques de hardware");
    await page.getByLabel(/Alternativas/).fill("bcrypt");
    await page.getByRole("button", { name: "Registrar decisão" }).last().click();
    await expect(page.getByText("Decisão registrada com autor e data.")).toBeVisible();
    await expect(page.getByText("Neste item (1)")).toBeVisible();
  } finally {
    await context.close();
  }
  const listed = await api(`/pbis/${pbi.id}/decisions`, { token: po.token });
  assert.deepEqual(listed.json.decisoes.map((item) => [item.titulo, item.origem.herdada]), [["Stack única em TypeScript", true], ["Hash de senha com scrypt", false]]);
  assert.ok(listed.json.decisoes.every((item) => item.autor?.nome && item.created_at));
  assert.equal((await api(`/epics/${epic.id}/decisions`, { token: po.token })).json.decisoes.length, 1, "épico não vê decisão do descendente");

  const readOnly = await openPage(dev);
  try {
    await readOnly.page.goto(url);
    await expect(readOnly.page.getByText("Neste item (1)")).toBeVisible();
    assert.equal(await readOnly.page.getByRole("button", { name: "Registrar decisão" }).count(), 0);
  } finally {
    await readOnly.context.close();
  }
  assert.equal((await api(`/pbis/${pbi.id}/decisions`, { method: "POST", token: dev.token, body: { titulo: "Negada", contexto: "c", decisao: "d", justificativa: "j" } })).status, 403);
  assert.equal((await api(`/pbis/${pbi.id}/decisions`)).status, 401);
  assert.equal((await api(`/pbis/00000000-0000-4000-8000-000000000000/decisions`, { token: po.token })).status, 404);

  await archiveProject(po, project);
  assert.equal((await api(`/pbis/${pbi.id}/decisions`, { method: "POST", token: po.token, body: { titulo: "Após arquivar", contexto: "c", decisao: "d", justificativa: "j" } })).status, 409);
  assert.equal((await api(`/pbis/${pbi.id}/decisions`, { token: po.token })).status, 200);
});

test("Autorização e isolamento: perfis, sessão e itens de outro projeto", async () => {
  const po = await createUser("po");
  const other = await createUser("po");
  const dev = await createUser("dev");
  const project = await createProject(po, "Isolado");
  const foreign = await createProject(other, "Alheio");
  const { pbi } = await createHierarchy(other, foreign);

  assert.equal((await api("/epics", { method: "POST", token: dev.token, body: { projeto_id: project.id, titulo: "Negado" } })).status, 403);
  assert.equal((await api(`/projects/${project.id}/backlog-tree`)).status, 401);
  assert.equal((await api(`/projects/${project.id}/backlog-search?q=recuperar`, { token: po.token })).json.items.length, 0);
  const cross = await api(`/projects/${project.id}/backlog-search?q=${encodeURIComponent("credenciais")}`, { token: po.token });
  assert.ok(!cross.json.items.some((item) => item.id === pbi.id), "item do outro projeto nunca aparece na busca deste");
  assert.equal((await api("/search?projeto_id=nao-uuid", { token: po.token })).status, 400);
  assert.equal((await api("/search?q=teste", { token: po.token })).status, 200);
  assert.equal((await api("/auth/me")).status, 401);
  assert.equal((await api("/auth/me", { token: "token-invalido" })).status, 401);
  assert.equal((await api("/admin/stats", { token: dev.token })).status === 200, false);
});
