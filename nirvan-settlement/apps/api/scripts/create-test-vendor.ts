import { loadEnvFiles } from "../src/env.ts";
import { loadConfig } from "../src/config.ts";
import { getDb } from "../src/db.ts";
import { createTestConnectedAccount } from "../src/stripe.ts";

loadEnvFiles();
const name = process.argv[2];
if (!name) {
  console.error("Usage: npm run create:vendor -- \"Vendor name\"");
  process.exit(1);
}
const config = loadConfig();
const db = getDb(config.databaseUrl);
const vendor = await db.vendor.create({
  data: { name, vatRegistered: false, active: true },
});
const accountId = await createTestConnectedAccount(config, db, vendor.id);
console.log(`${vendor.id} ${accountId}`);
await db.$disconnect();
