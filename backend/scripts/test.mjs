import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

function discoverTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return discoverTests(path);
    return entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const files = discoverTests("src").sort();
if (files.length === 0) throw new Error("Nenhum teste de backend encontrado.");

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  env: { ...process.env, NODE_ENV: "test" },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
