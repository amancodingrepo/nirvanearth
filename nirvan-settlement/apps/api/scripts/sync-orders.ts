import { loadEnvFiles } from "../src/env.ts";
import { loadConfig } from "../src/config.ts";
import { getDb } from "../src/db.ts";
import { ingestShopifyOrder } from "../src/ingest.ts";
import { fetchPaidOrders } from "../src/shopify.ts";

loadEnvFiles();

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const daysArg = process.argv.find((arg) => arg.startsWith("--days="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 1;
const days = daysArg ? Number(daysArg.slice("--days=".length)) : undefined;
if (!Number.isInteger(limit) || limit < 1) {
  console.error("Usage: npm run sync:orders -- --limit=1 [--days=30]");
  process.exit(1);
}

const config = loadConfig();
const db = getDb(config.databaseUrl);
let orders;
try {
  orders = await fetchPaidOrders(config, { limit, days }, db);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  await db.$disconnect();
  process.exit(1);
}
if (orders.length === 0) {
  console.log("orders upserted=0 lines upserted=0");
  console.log("Shopify returned no paid orders.");
  await db.$disconnect();
  process.exit(0);
}

let linesUpserted = 0;
for (const order of orders) {
  const lines = order.line_items ?? [];
  const productTotal = lines.reduce((sum, line) => sum + Number(line.price ?? 0) * Number(line.quantity ?? 1), 0);
  console.log(
    `order ${order.id} ${order.name ?? ""} ${order.financial_status ?? ""} ${order.currency ?? ""} lines=${lines.length} product_total=${productTotal.toFixed(2)}`,
  );
  for (const line of lines) {
    console.log(`  ${line.title ?? "Item"} qty=${line.quantity ?? 1} price=${line.price ?? 0}`);
  }
  const result = await ingestShopifyOrder(db, config, order, "cli");
  linesUpserted += result.lineCount;
}
console.log(`orders upserted=${orders.length} lines upserted=${linesUpserted}`);
await db.$disconnect();
