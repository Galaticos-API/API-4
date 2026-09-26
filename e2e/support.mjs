import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

export const API = process.env.E2E_API_URL ?? "http://localhost:3001/api/v1";
export const APP = process.env.E2E_APP_URL ?? "http://localhost:5173";
export const PASSWORD = "Senha-forte-123";

export async function api(path, { token, method = "GET", body, headers = {} } = {}) {
  const raw = body instanceof Uint8Array;
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body && !raw ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
  return { status: response.status, json };
}

export async function createUser(role) {
  const email = `${role}-${randomUUID().slice(0, 8)}@e2e.test`;
  const registered = await api("/auth/register", { method: "POST", body: { nome: `E2E ${role}`, email, password: PASSWORD, role } });
  if (registered.status !== 201 && registered.status !== 200) throw new Error(`register ${role}: ${registered.status} ${JSON.stringify(registered.json)}`);
  const login = await api("/auth/login", { method: "POST", body: { email, password: PASSWORD } });
  if (login.status !== 200) throw new Error(`login ${role}: ${login.status}`);
  return { email, password: PASSWORD, token: login.json.token, user: login.json.user };
}

export async function createProject(account, label = "Projeto") {
  const response = await api("/projects", {
    method: "POST",
    token: account.token,
    body: { nome: `${label} ${randomUUID().slice(0, 8)}`, cliente: "Cliente E2E", descricao: "Projeto criado pelo E2E." },
  });
  if (response.status !== 201) throw new Error(`projeto: ${response.status} ${JSON.stringify(response.json)}`);
  return response.json;
}

export async function archiveProject(account, project) {
  const impact = await api(`/projects/${project.id}/archive-impact`, { token: account.token });
  const archived = await api(`/projects/${project.id}/archive`, { method: "PATCH", token: account.token, body: { confirmado: true, impacto: impact.json } });
  if (archived.status !== 200) throw new Error(`arquivar: ${archived.status} ${JSON.stringify(archived.json)}`);
}

export function uploadRaw(account, projectId, name, content) {
  return api(`/projects/${projectId}/documents`, {
    method: "POST",
    token: account.token,
    body: typeof content === "string" ? new TextEncoder().encode(content) : content,
    headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(name) },
  });
}

export const pdfContent = () => `%PDF-1.7\n${" ".repeat(200)}`;

let browser;

export async function getBrowser() {
  browser ??= await chromium.launch({
    headless: true,
    ...(process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : { channel: "chrome" }),
  });
  return browser;
}

export async function closeBrowser() {
  await browser?.close();
  browser = undefined;
}

export async function openPage(account, { width = 1440, height = 900 } = {}) {
  const context = await (await getBrowser()).newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.addInitScript((token) => localStorage.setItem("app_auth_token", token), account.token);
  return { context, page };
}

export async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`${label}: overflow horizontal de ${overflow}px`);
}

export async function createHierarchy(account, project, labels = {}) {
  const epic = await api("/epics", { method: "POST", token: account.token, body: { projeto_id: project.id, titulo: labels.epic ?? "Épico de autenticação", descricao: "Objetivo de acesso seguro à plataforma" } });
  if (epic.status !== 201) throw new Error(`épico: ${epic.status} ${JSON.stringify(epic.json)}`);
  const feature = await api("/features", { method: "POST", token: account.token, body: { epico_id: epic.json.id, titulo: labels.feature ?? "Sessão do usuário", descricao: "Controle de sessão e expiração" } });
  if (feature.status !== 201) throw new Error(`feature: ${feature.status} ${JSON.stringify(feature.json)}`);
  const pbi = await api("/pbis", {
    method: "POST",
    token: account.token,
    body: {
      feature_id: feature.json.id,
      titulo: labels.pbi ?? "Validar credenciais no login",
      historia_como_um: "usuário cadastrado",
      historia_eu_quero: "entrar com e-mail e senha",
      historia_para_que: "acessar meus projetos com segurança",
    },
  });
  if (pbi.status !== 201) throw new Error(`pbi: ${pbi.status} ${JSON.stringify(pbi.json)}`);
  return { epic: epic.json, feature: feature.json, pbi: pbi.json };
}

export async function addScenario(account, pbiId) {
  return api("/criteria", {
    method: "POST",
    token: account.token,
    body: { entidade_tipo: "pbi", entidade_id: pbiId, nome: "Login válido", dado: "um usuário cadastrado", quando: "informar credenciais corretas", entao: "o sistema abre a área interna" },
  });
}

export async function runAxe(page, label, { include } = {}) {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const result = await page.evaluate(async (scope) => {
    // eslint-disable-next-line no-undef
    return axe.run(scope ? { include: [scope] } : document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
  }, include ?? null);
  const blocking = result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  return { label, blocking, all: result.violations };
}

export function formatViolations(report) {
  return report.blocking
    .map((violation) => `${report.label}: [${violation.impact}] ${violation.id} - ${violation.help} (${violation.nodes.length} elemento(s): ${violation.nodes.slice(0, 2).map((node) => node.target.join(" ")).join(" | ")})`)
    .join("\n");
}
