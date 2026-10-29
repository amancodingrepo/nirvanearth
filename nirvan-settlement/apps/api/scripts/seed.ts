import { loadEnvFiles } from "../src/env.ts";
import { loadConfig } from "../src/config.ts";
import { getDb } from "../src/db.ts";
import { ensureActiveRule } from "../src/rules-store.ts";

loadEnvFiles();
const config = loadConfig();
const db = getDb(config.databaseUrl);

await ensureActiveRule(db, config);

for (const email of config.approverEmails) {
  await db.adminUser.upsert({
    where: { email },
    create: { email },
    update: {},
  });
  console.log(`admin ${email}`);
}

await db.$disconnect();
