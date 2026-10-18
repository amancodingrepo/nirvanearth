import { loadEnvFiles } from "../src/env.ts";
import { loadConfig } from "../src/config.ts";
import { getDb } from "../src/db.ts";
import { runSeedDemo } from "../src/seed-demo.ts";

loadEnvFiles();
const config = loadConfig();
const db = getDb(config.databaseUrl);

const result = await runSeedDemo(db, config);
console.log(`Demo data seeded. Orders: ${result.ordersUpserted}, Lines: ${result.linesUpserted}`);
await db.$disconnect();
