import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const files = readdirSync("tests").filter((file) => file.endsWith(".e2e.mjs")).sort().map((file) => join("tests", file));
if (files.length === 0) throw new Error("Nenhum teste E2E encontrado.");
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
