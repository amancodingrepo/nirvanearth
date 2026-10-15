import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync("npm", ["run", "stripe:ping", "-w", "@nirvan/api"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
