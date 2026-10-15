import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync("npx", ["prisma", "db", "push"], {
  cwd,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/nirvan_settlement_test",
  },
});
process.exit(result.status ?? 1);
