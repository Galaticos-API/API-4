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
