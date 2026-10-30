import { loadEnvFiles } from "../src/env.ts";
import { loadConfig } from "../src/config.ts";
import { getDb } from "../src/db.ts";
import { syncShopifyLedger } from "../src/sync.ts";

loadEnvFiles();

const daysArg = process.argv.find((arg) => arg.startsWith("--days="));
const days = daysArg ? Number(daysArg.slice("--days=".length)) : undefined;
if (daysArg && (!Number.isFinite(days) || (days ?? 0) < 1)) {
  console.error("Usage: npm run sync:orders -- [--days=30]");
  process.exit(1);
}

const config = loadConfig();
const db = getDb(config.databaseUrl);
try {
  const result = await syncShopifyLedger(db, config, "cli", { days });
  console.log(
    `orders upserted=${result.ordersUpserted} lines upserted=${result.linesUpserted} refreshed=${result.refreshed} truncated=${result.truncated}`,
  );
  if (result.truncated) {
    console.log("Sync stopped at the page cap. Cursor was not moved. Run sync again.");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(/\bshp(?:at|ss|ca)_[A-Za-z0-9]+\b/g, "[redacted-token]"));
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
