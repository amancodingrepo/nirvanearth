import { loadEnvFiles } from "./env.ts";
import { loadConfig } from "./config.ts";
import { getDb } from "./db.ts";
import { buildApp } from "./server.ts";

loadEnvFiles();

const config = loadConfig();
const db = getDb(config.databaseUrl);
const app = await buildApp({ config, db });
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
console.log(`Nirvan Earth settlement ledger at http://localhost:${port}`);
