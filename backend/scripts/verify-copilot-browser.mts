import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool } from "pg";
const require = createRequire(import.meta.url);
const { chromium } = require("../../e2e/node_modules/playwright-core");
export async function verifyCopilotBrowser({
  apiUrl,
  pool,
  token,
  projectId,
  setUnavailable,
  setDelay,
  harnessEvidence,
}: {
  apiUrl: string;
  pool: Pool;
  token: string;
  projectId: string;
  setUnavailable: (value: boolean) => Promise<void>;
  setDelay: (value: number) => Promise<void>;
  harnessEvidence?: unknown;
}) {
  const { preview } =
    await import("../../frontend/node_modules/vite/dist/node/index.js");
  const [epic, feature, pbi, criterion] = Array.from({ length: 4 }, () =>
    randomUUID(),
  );
  await pool.query(
    "UPDATE projeto SET nome='Projeto Demonstração S2-10' WHERE id=$1",
    [projectId],
  );
  await pool.query(
    "INSERT INTO epico(id,projeto_id,titulo,status) VALUES($1,$2,'Digitalizar pagamentos','rascunho')",
    [epic, projectId],
  );
  await pool.query(
    "INSERT INTO feature(id,epico_id,titulo,status) VALUES($1,$2,'Consultar pagamentos','rascunho')",
    [feature, epic],
  );
  await pool.query(
    "INSERT INTO pbi(id,feature_id,codigo,titulo,historia_como_um,historia_eu_quero,historia_para_que,status,requer_interface) VALUES($1,$2,'PBI-210','Consultar pagamento','cliente','consultar pagamento de forma rápida','acompanhar o recebimento','rascunho',true)",
    [pbi, feature],
  );
  await pool.query(
    "INSERT INTO criterio_aceitacao(id,entidade_tipo,entidade_id,texto,nome,dado,quando,entao,ordem) VALUES($1,'pbi',$2,'Consultar pagamento válido','Caminho principal','Cliente autenticado','Consultar pagamento','Exibir pagamento',1)",
    [criterion, pbi],
  );
  const web = await preview({
    root: resolve("../frontend"),
    configFile: false,
    preview: {
      host: "127.0.0.1",
      port: 5189,
      strictPort: true,
      proxy: { "/api": { target: apiUrl, changeOrigin: true } },
    },
  });
  let browser: any;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.E2E_CHROME_PATH
        ? { executablePath: process.env.E2E_CHROME_PATH }
        : { channel: process.platform === "win32" ? "msedge" : "chromium" }),
    });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1100 },
      }),
      errors: string[] = [];
    page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.addInitScript(
      (value: string) => localStorage.setItem("app_auth_token", value),
      token,
    );
    await page.goto(
      "http://127.0.0.1:5189/projects/" +
        projectId +
        "/epics/" +
        epic +
        "/features/" +
        feature +
        "/pbis/" +
        pbi,
    );
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    const title = page.getByLabel("Título", { exact: true });
    await title.fill("Consultar pagamento em edição");
    await page
      .getByRole("button", { name: "Analisar lacunas", exact: true })
      .click();
    await page
      .getByText("Quem pode consultar o pagamento?", { exact: false })
      .waitFor();
    assert.equal(await title.inputValue(), "Consultar pagamento em edição");
    assert.equal(
      (await pool.query("SELECT titulo FROM pbi WHERE id=$1", [pbi])).rows[0]
        .titulo,
      "Consultar pagamento",
    );
    const artifacts = resolve(
      process.env.DEMO_OUTPUT_DIR ?? "../docs/evidence",
    );
    await mkdir(artifacts, { recursive: true });
    async function capture(name: string, selector = ".copilot-panel") {
      const target = page.locator(selector);
      const size = await target.boundingBox();
      const viewport = page.viewportSize();
      await page.setViewportSize({
        width: viewport.width,
        height: Math.max(1100, Math.ceil(size.height) + 280),
      });
      await target.evaluate((node: HTMLElement) =>
        window.scrollTo(
          0,
          node.getBoundingClientRect().top + window.scrollY - 150,
        ),
      );
      await target.screenshot({ path: resolve(artifacts, name) });
      await page.setViewportSize(viewport);
    }

    await capture("S2-10-questionador.png");
    await page.getByRole("button", { name: "Descartar resposta" }).click();
    await setDelay(6000);
    await page
      .getByRole("button", { name: "Analisar lacunas", exact: true })
      .click();
    await page.getByText(/ultrapassou 5 segundos/).waitFor();
    assert.equal(await title.isEnabled(), true);
    await capture("S2-10-demora.png");
    await page.getByRole("button", { name: "Cancelar análise" }).click();
    await page
      .getByText("Análise cancelada. Sua edição foi preservada.")
      .waitFor();
    await setDelay(0);
    await page.getByRole("radio", { name: "Padronizar texto" }).check();
    await page.getByRole("button", { name: "Propor padronização" }).click();
    await page
      .getByText("Consultar pagamento padronizado", { exact: true })
      .waitFor();
    assert.equal(await title.inputValue(), "Consultar pagamento em edição");
    assert.equal(
      (await pool.query("SELECT count(*)::int AS n FROM sugestao_ia")).rows[0]
        .n,
      0,
    );
    await capture("S2-10-padronizador.png");
    await page.addScriptTag({
      path: require.resolve("../../e2e/node_modules/axe-core/axe.min.js"),
    });
    const violations = await page.evaluate(async () => {
      const report = await (window as any).axe.run(
        document.querySelector(".copilot-panel"),
      );
      return report.violations
        .filter((v: any) => ["serious", "critical"].includes(v.impact))
        .map((v: any) => v.id);
    });
    assert.deepEqual(violations, []);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    await capture("S2-10-mobile.png");
    await page.getByRole("button", { name: "Descartar resposta" }).click();
    await setUnavailable(true);
    await page.getByRole("button", { name: "Propor padronização" }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Sua edição foi preservada" })
      .waitFor();
    assert.equal(await title.inputValue(), "Consultar pagamento em edição");
    await page.setViewportSize({ width: 1440, height: 1100 });
    await capture("S2-10-indisponibilidade.png", "article:has(.copilot-panel)");
    await page
      .getByRole("button", { name: "Salvar alterações", exact: true })
      .click();
    await page.getByRole("button", { name: "Editar", exact: true }).waitFor();
    assert.equal(
      (await pool.query("SELECT titulo FROM pbi WHERE id=$1", [pbi])).rows[0]
        .titulo,
      "Consultar pagamento em edição",
    );
    assert.deepEqual(errors, []);
    await setUnavailable(false);
    await page.setViewportSize({ width: 1440, height: 1100 });
    for (const [level, path] of [
      ["epico", "/projects/" + projectId + "/epics/" + epic],
      [
        "feature",
        "/projects/" + projectId + "/epics/" + epic + "/features/" + feature,
      ],
    ]) {
      await page.goto("http://127.0.0.1:5189" + path);
      await page.getByRole("button", { name: "Editar", exact: true }).click();
      await page
        .getByLabel("Descrição", { exact: true })
        .fill("Acompanhar pagamentos do cliente");
      await page
        .getByLabel("Objetivo", { exact: true })
        .fill("Dar transparência ao recebimento");
      if (level === "epico") {
        await page
          .getByLabel("Escopo macro", { exact: true })
          .fill("Consulta e acompanhamento de pagamentos");
        await page
          .getByLabel("Resultado esperado", { exact: true })
          .fill("Cliente acompanha recebimentos");
      }
      await page.getByRole("button", { name: "Propor padronização" }).click();
      await page
        .getByText("Consultar pagamento padronizado", { exact: true })
        .waitFor();
      assert.equal(
        await page
          .locator(".copilot-proposal")
          .getByText("Como um", { exact: true })
          .count(),
        0,
      );
      if (level === "epico")
        assert.equal(
          await page
            .locator(".copilot-proposal")
            .getByText("Escopo macro", { exact: true })
            .count(),
          1,
        );
      assert.equal(
        await page.getByLabel("Descrição", { exact: true }).inputValue(),
        "Acompanhar pagamentos do cliente",
      );
      await capture("S2-10-" + level + ".png");
    }
    if (harnessEvidence) {
      const report = await browser.newPage({
        viewport: { width: 1200, height: 1000 },
      });
      const evidence = harnessEvidence as any;
      const escaped = (value: unknown) =>
        JSON.stringify(value, null, 2)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
      await report.setContent(
        '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Evidência técnica S2-09</title><style>body{font:18px Arial;background:#101621;color:#fff;padding:36px}h1{color:#f98b50}h2{font-size:20px}p{color:#bec8d8;line-height:1.5}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}section{background:#172231;border:1px solid #3b4d61;padding:20px;border-radius:10px}pre{font:16px Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}</style><h1>S2-09 · Harness versionado</h1><p>Relatório de demonstração com respostas reais da API e banco isolado. Não é uma tela administrativa do produto. As respostas do Ollama foram simuladas.</p><div class="grid"><section><h2>Antes da alteração</h2><pre>' +
          escaped(evidence.before) +
          "</pre></section><section><h2>Solicitação seguinte, sem reiniciar</h2><pre>" +
          escaped(evidence.after) +
          "</pre></section><section><h2>Histórico preservado</h2><pre>" +
          escaped(evidence.history) +
          "</pre></section><section><h2>Independência e concorrência</h2><pre>" +
          escaped(evidence.control) +
          "</pre></section></div></html>",
      );
      await report.screenshot({
        path: resolve(artifacts, "S2-09-harness.png"),
        fullPage: true,
      });
      await report.close();
    }
    const ragPage=await browser.newPage({viewport:{width:1440,height:1100}});
    await ragPage.addInitScript((value:string)=>localStorage.setItem('app_auth_token',value),token);
    let releaseHistory!:()=>void;
    const historyGate=new Promise<void>(resolve=>{releaseHistory=resolve;});
    await ragPage.route('**/api/v1/chat/conversations',async(route:any)=>{await historyGate;await route.continue();},{times:1});
    await ragPage.goto('http://127.0.0.1:5189/chat');
    await ragPage.getByLabel('Escopo da consulta').selectOption('projeto:'+projectId);
    await ragPage.getByRole('textbox').fill('Pergunta mantida enquanto o histórico carrega');
    const pendingHistory=ragPage.waitForResponse(response=>response.url().endsWith('/api/v1/chat/conversations'));
    releaseHistory();
    const historyBody=await(await pendingHistory).json();
    assert.ok(historyBody.items.length>0);
    await ragPage.getByRole('navigation',{name:'Histórico de conversas'}).getByText(historyBody.items[0].titulo,{exact:true}).first().waitFor({state:'visible'});
    assert.equal(await ragPage.getByLabel('Escopo da consulta').isEnabled(),true);
    assert.equal(await ragPage.getByRole('textbox').inputValue(),'Pergunta mantida enquanto o histórico carrega');
    await ragPage.getByRole('button',{name:'Nova conversa',exact:true}).click();
    await ragPage.getByLabel('Escopo da consulta').selectOption('projeto:'+projectId);
    const question=ragPage.getByRole('textbox');
    await question.fill('Consultar pedido');
    await ragPage.getByRole('button',{name:'Enviar',exact:true}).click();
    await ragPage.locator('.chat-sources summary').last().click();
    const source=ragPage.locator('.chat-sources a').last();await source.waitFor({state:'visible'});
    const href=await source.getAttribute('href');assert.ok(href?.startsWith('/projects/'+projectId));
    await source.click();await ragPage.waitForURL('**'+href);
    await ragPage.goto('http://127.0.0.1:5189/chat');
    await ragPage.waitForFunction(()=>document.querySelector<HTMLSelectElement>('#chat-scope')?.disabled===true);
    await ragPage.getByRole('button',{name:'Nova conversa',exact:true}).click();
    await ragPage.getByLabel('Escopo da consulta').selectOption('projeto:'+projectId);
    try {
      await setUnavailable(true);
      await ragPage.getByRole('textbox').fill('Consultar pedido durante indisponibilidade');
      await ragPage.getByRole('button',{name:'Enviar',exact:true}).click();
      // Com código de diagnóstico do backend a tela usa a mensagem específica; sem ele, a genérica.
      await ragPage.getByText(/A consulta falhou, mas sua pergunta foi preservada|Não foi possível falar com o assistente agora/).waitFor({state:'visible'});
      assert.equal(await ragPage.getByRole('textbox').inputValue(),'Consultar pedido durante indisponibilidade');
      await setUnavailable(false);
      const retry=ragPage.waitForResponse(response=>/\/api\/v1\/chat\/query(\/stream)?$/.test(response.url())&&response.request().method()==='POST');
      await ragPage.getByRole('button',{name:'Tentar novamente',exact:true}).click();
      assert.equal((await retry).status(),200);
      assert.equal(await ragPage.getByRole('textbox').inputValue(),'');
    } finally {await setUnavailable(false);await ragPage.close();}
    console.log('S2-24 navegador aprovado: histórico atrasado preserva o escopo; evidências e navegação à fonte; recuperação após indisponibilidade sem perder a pergunta.');
    console.log(
      "S2-10 navegador aprovado: questionador, proposta separada, demora, cancelamento, IA indisponível com edição salva, mobile, acessibilidade e padronização de épico/feature.",
    );
  } finally {
    await setUnavailable(false);
    await setDelay(0);
    await browser?.close();
    await new Promise<void>((r) => web.httpServer.close(() => r()));
  }
}
