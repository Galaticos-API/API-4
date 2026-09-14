import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function discover(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? discover(path) : entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const files = discover("src").sort();
if (!files.length) throw new Error("Nenhum teste de backend encontrado.");
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "test" },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
