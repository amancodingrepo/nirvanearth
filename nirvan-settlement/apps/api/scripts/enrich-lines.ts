import { loadEnvFiles } from "../src/env.ts";
import { loadConfig } from "../src/config.ts";
import { getDb } from "../src/db.ts";
import { enrichLines } from "../src/ingest.ts";

loadEnvFiles();
const config = loadConfig();
const db = getDb(config.databaseUrl);
const result = await enrichLines(db, config, "cli");
console.log(`orders=${result.orders} lines=${result.lines}`);
await db.$disconnect();
