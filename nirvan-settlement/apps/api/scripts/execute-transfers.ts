import { loadEnvFiles } from "../src/env.ts";
import { loadConfig } from "../src/config.ts";
import { getDb } from "../src/db.ts";
import { createMailer } from "../src/mailer.ts";
import { executePack } from "../src/execute.ts";
import { createStripeGateway } from "../src/stripe.ts";

loadEnvFiles();
const packArg = process.argv.find((arg) => arg.startsWith("--pack="));
const packId = packArg?.slice("--pack=".length);
if (!packId) {
  console.error("Usage: npm run execute -- --pack=<packId>");
  process.exit(1);
}
const config = loadConfig();
const db = getDb(config.databaseUrl);
const actor = config.approverEmails[0];
if (!actor) throw new Error("APPROVER_EMAILS is empty.");
const results = await executePack(db, config, createMailer(config), createStripeGateway(config), packId, actor);
console.log(JSON.stringify(results, null, 2));
await db.$disconnect();
