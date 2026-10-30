import { loadEnvFiles } from "./env.ts";
import { loadConfig } from "./config.ts";
import { getDb } from "./db.ts";
import { buildApp } from "./server.ts";
import { registerOrderWebhooks } from "./shopify.ts";
import { startSyncSchedule } from "./sync.ts";

loadEnvFiles();

const config = loadConfig();
const db = getDb(config.databaseUrl);
const app = await buildApp({ config, db });
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
console.log(`Nirvan Earth settlement ledger at http://localhost:${port}`);

if (config.appUrl.startsWith("https://") && process.env.ENABLE_SHOPIFY_WEBHOOK_REGISTER !== "false") {
  registerOrderWebhooks(config, db)
    .then((result) => {
      console.log(
        `shopify webhooks existing=${result.existing.join(",") || "none"} created=${result.created.join(",") || "none"}`,
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "error";
      console.log(`shopify webhook register failed ${message.replace(/\bshp(?:at|ss|ca)_[A-Za-z0-9]+\b/g, "[redacted-token]").slice(0, 180)}`);
    });
}

startSyncSchedule(db, config);
// reloaded

