import axios from "axios";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
const name = "sinapse-harness-real-" + randomUUID().slice(0, 8),
  token = randomUUID();
const started = spawnSync(
  "docker",
  [
    "run",
    "-d",
    "--name",
    name,
    "--add-host",
    "host.docker.internal:host-gateway",
    "-e",
    "AI_SERVICE_TOKEN=" + token,
    "-e",
    "WORKSPACE_DIR=/tmp/analyzer",
    "-e",
    "PYTHONDONTWRITEBYTECODE=1",
    "-e",
    "OLLAMA_BASE_URL=http://host.docker.internal:11434",
    "--mount",
    "type=bind,source=" + resolve("../ai-service") + ",target=/app,readonly",
    "-p",
    "127.0.0.1::8000",
    "sinapse-s209-ai-test",
  ],
  { encoding: "utf8" },
);
if (started.status !== 0)
  throw Error("Não foi possível iniciar o serviço de teste.");
const keepAlive = setInterval(() => {}, 1000);
try {
  const port = JSON.parse(
    spawnSync("docker", ["inspect", name], { encoding: "utf8" }).stdout,
  )[0].NetworkSettings.Ports["8000/tcp"][0].HostPort;
  process.env.NODE_ENV = "test";
  process.env.AI_SERVICE_TOKEN = token;
  process.env.AI_SERVICE_URL = "http://127.0.0.1:" + port;
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      if (
        (
          await axios.get(process.env.AI_SERVICE_URL + "/openapi.json", {
            headers: { "X-Service-Token": token },
            timeout: 3000,
          })
        ).status === 200
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(ready);
  const { defaultConfig, requestSchema } =
    await import("../src/modules/harness/harness.contract.js");
  const { HarnessService, HttpHarnessEngine } =
    await import("../src/modules/harness/harness.service.js");
  const repo = {
    async current(mode: any) {
      return {
        mode,
        version: 0,
        schema_version: 1,
        config: { ...defaultConfig(mode), timeout_ms: 60000 },
        created_at: null,
        created_by: null,
      };
    },
  };
  const engine = new HttpHarnessEngine();
  const service = new HarnessService(repo as any, {
    async generate(payload, timeout) {
      try {
        return await engine.generate(payload, timeout);
      } catch (error: any) {
        console.log(
          JSON.stringify({
            failure_status: error.response?.status,
            category: error.response?.data?.detail ?? error.code,
          }),
        );
        throw Error("Falha na geração local");
      }
    },
  });
  const fields = {
    titulo: "Consultar pedido",
    historia_como_um: "cliente autenticado",
    historia_eu_quero: "consultar o status do meu pedido rapidamente",
    historia_para_que: "acompanhar a entrega",
    regras_observacoes: "Somente o cliente proprietário consulta o pedido.",
    texto_livre: JSON.stringify({
      requer_interface: false,
      criterios_salvos: [
        {
          nome: "Caminho principal",
          dado: "cliente autenticado proprietário",
          quando: "consultar pedido válido",
          entao: "exibir status",
        },
      ],
    }),
  };
  for (const operation of ["questionar", "padronizar"]) {
    const start = Date.now();
    const result = await service.run(
      "60000000-0000-4000-8000-000000000001",
      requestSchema.parse({
        mode: "levantamento",
        operation,
        level: "pbi",
        fields,
      }),
    );
    console.log(
      JSON.stringify({
        operation,
        duration_ms: Date.now() - start,
        result: result.result,
      }),
    );
    const output = result.result as any;
    if (operation === "questionar") {
      assert.ok(
        output.questions.every(
          (q: any) =>
            q.dimension !== "interface" && q.dimension !== "caminho_principal",
        ),
        "Pergunta de interface quando não se aplica",
      );
      assert.ok(
        output.questions.some((q: any) =>
          /tempo|prazo|latência|rápid|rapidez|duração/i.test(q.question),
        ),
        "Não questionou a condição sem critério verificável",
      );
    } else {
      assert.ok(
        output.proposal,
        "Não propôs a padronização mesmo com os campos obrigatórios preenchidos",
      );
      assert.deepEqual(
        output.questions,
        [],
        "Padronização voltou a perguntar sobre campos preenchidos",
      );
    }
  }
} finally {
  clearInterval(keepAlive);
  spawnSync("docker", ["rm", "-f", "-v", name], { stdio: "ignore" });
  console.log("Serviço de teste real removido.");
}
