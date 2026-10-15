import { loadEnvFiles } from "../src/env.ts";
import { loadConfig } from "../src/config.ts";
import { getDb } from "../src/db.ts";
import { generateMonthPack } from "../src/pack.ts";

loadEnvFiles();
const yearMonth = process.argv[2];
if (!yearMonth) {
  console.error("Usage: npm run pack -- YYYY-MM");
  process.exit(1);
}
const config = loadConfig();
const db = getDb(config.databaseUrl);
const pack = await generateMonthPack(db, config, yearMonth, "cli");
console.log(`${pack.id} ${pack.yearMonth} ${pack.status} lines=${pack.lines.length}`);
await db.$disconnect();
