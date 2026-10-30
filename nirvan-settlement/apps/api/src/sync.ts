import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./config.ts";
import { ingestShopifyOrder } from "./ingest.ts";
import { fetchAllPaidOrders, fetchOrderById, fetchUpdatedOrders, verifyShopifyWebhookHmac } from "./shopify.ts";
import type { ShopifyOrder } from "./types.ts";

const PAID_STATUSES = new Set(["paid", "partially_paid", "partially_refunded", "refunded"]);
const WEBHOOK_TOPICS = new Set(["orders/paid", "orders/updated", "refunds/create"]);

export interface SyncResult {
  imported: number;
  ordersUpserted: number;
  linesUpserted: number;
  refreshed: number;
  truncated: boolean;
}

export async function syncShopifyLedger(
  db: PrismaClient,
  config: AppConfig,
  actorEmail: string,
  options: { days?: number } = {},
): Promise<SyncResult> {
  const started = new Date();
  const cursor = await db.syncState.findUnique({ where: { id: "shopify" } });
  const createdAtMin = options.days && options.days > 0
    ? new Date(started.getTime() - options.days * 24 * 60 * 60 * 1000)
    : cursor?.lastSyncedAt ?? undefined;

  const paid = await fetchAllPaidOrders(config, db, { createdAtMin });
  let linesUpserted = 0;
  for (const order of paid.orders) {
    const result = await ingestShopifyOrder(db, config, order, actorEmail);
    linesUpserted += result.lineCount;
  }

  let refreshed = 0;
  let truncated = paid.truncated;
  if (cursor?.lastSyncedAt) {
    const overlap = new Date(cursor.lastSyncedAt.getTime() - 5 * 60 * 1000);
    const updated = await fetchUpdatedOrders(config, db, overlap);
    truncated = truncated || updated.truncated;
    const paidIds = new Set(paid.orders.map((order) => String(order.id)));
    for (const order of updated.orders) {
      if (paidIds.has(String(order.id))) continue;
      const status = String(order.financial_status ?? "");
      const known = await db.orderSnapshot.findUnique({ where: { shopifyOrderId: String(order.id) } });
      if (!known && !PAID_STATUSES.has(status)) continue;
      const result = await ingestShopifyOrder(db, config, order, actorEmail);
      linesUpserted += result.lineCount;
      refreshed += 1;
    }
  }

  if (!truncated) {
    await db.syncState.upsert({
      where: { id: "shopify" },
      create: { id: "shopify", shop: config.shopifyShop, lastSyncedAt: started },
      update: { shop: config.shopifyShop, lastSyncedAt: started },
    });
  }

  return {
    imported: paid.orders.length + refreshed,
    ordersUpserted: paid.orders.length + refreshed,
    linesUpserted,
    refreshed,
    truncated,
  };
}

export function startSyncSchedule(db: PrismaClient, config: AppConfig): void {
  if (process.env.ENABLE_SYNC_INTERVAL === "false") return;
  if (config.nodeEnv === "test") return;
  const ms = Number(process.env.SYNC_INTERVAL_MS ?? 20 * 60 * 1000);
  if (!Number.isFinite(ms) || ms < 60_000) return;
  const timer = setInterval(() => {
    syncShopifyLedger(db, config, "schedule")
      .then((result) => {
        console.log(
          `scheduled sync orders=${result.ordersUpserted} lines=${result.linesUpserted} truncated=${result.truncated}`,
        );
      })
      .catch((error: unknown) => {
        console.log(`scheduled sync failed ${safeError(error)}`);
      });
  }, ms);
  timer.unref();
}

export async function acceptShopifyWebhook(
  db: PrismaClient,
  config: AppConfig,
  input: { rawBody: string; hmac: string | undefined; topic: string | undefined },
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!config.shopifyApiSecret || !verifyShopifyWebhookHmac(input.rawBody, input.hmac, config.shopifyApiSecret)) {
    return { status: 401, body: { error: "Invalid Shopify webhook signature." } };
  }
  const topic = input.topic ?? "";
  if (!WEBHOOK_TOPICS.has(topic)) {
    return { status: 200, body: { ignored: true } };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(input.rawBody) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "Invalid JSON." } };
  }

  let order: ShopifyOrder | null = null;
  try {
    if (topic === "refunds/create") {
      const orderId = payload.order_id;
      if (orderId == null) return { status: 200, body: { ignored: true } };
      order = await fetchOrderById(config, db, String(orderId));
    } else if (payload.id != null) {
      try {
        order = await fetchOrderById(config, db, String(payload.id));
      } catch {
        order = payload as unknown as ShopifyOrder;
      }
    }
  } catch (error) {
    console.log(`shopify webhook fetch failed topic=${topic} ${safeError(error)}`);
    return { status: 500, body: { error: "Could not load the Shopify order." } };
  }

  if (!order?.id) return { status: 200, body: { ignored: true } };

  const financialStatus = String(order.financial_status ?? "");
  const known = await db.orderSnapshot.findUnique({ where: { shopifyOrderId: String(order.id) } });
  if (!known && !PAID_STATUSES.has(financialStatus)) {
    return { status: 200, body: { ignored: true, reason: "not_in_ledger" } };
  }

  try {
    const result = await ingestShopifyOrder(db, config, order, "shopify-webhook");
    console.log(`shopify webhook ${topic} order=${result.shopifyOrderId} lines=${result.lineCount}`);
    return { status: 200, body: { ok: true, shopifyOrderId: result.shopifyOrderId, lineCount: result.lineCount } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ingest failed";
    if (message.includes("AED") || message.includes("financial_status")) {
      console.log(`shopify webhook skipped order=${String(order.id)}`);
      return { status: 200, body: { skipped: true } };
    }
    console.log(`shopify webhook failed topic=${topic} ${safeError(error)}`);
    return { status: 500, body: { error: "ingest failed" } };
  }
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "error";
  return message
    .replace(/\bshp(?:at|ss|ca)_[A-Za-z0-9]+\b/g, "[redacted-token]")
    .replace(/\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]+\b/g, "[redacted-key]")
    .slice(0, 180);
}
