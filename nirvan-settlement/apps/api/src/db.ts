import { PrismaClient } from "@prisma/client";

let client: PrismaClient | undefined;

export function getDb(url = process.env.DATABASE_URL): PrismaClient {
  if (!client) {
    if (!url) throw new Error("DATABASE_URL is required.");
    client = new PrismaClient({ datasources: { db: { url } } });
  }
  return client;
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

export async function resetDatabase(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      "transfer_attempts",
      "email_messages",
      "approvals",
      "audit_events",
      "order_lines",
      "settlement_lines",
      "month_packs",
      "adjustments",
      "order_snapshots",
      "vendors",
      "admin_users"
    RESTART IDENTITY CASCADE
  `);
}
