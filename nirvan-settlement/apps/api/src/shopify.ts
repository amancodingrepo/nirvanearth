import type { AppConfig } from "./config.ts";
import type { ShopifyOrder } from "./types.ts";

const API_VERSION = "2024-10";

export async function fetchPaidOrders(
  config: AppConfig,
  limitOrOptions: number | { limit?: number; days?: number } = 50,
): Promise<ShopifyOrder[]> {
  if (!config.shopifyToken) {
    throw new Error("SHOPIFY_ADMIN_TOKEN is empty. Polling needs a collaborator Admin API token.");
  }
  const options = typeof limitOrOptions === "number" ? { limit: limitOrOptions } : limitOrOptions;
  const limit = options.limit ?? 50;
  const params = new URLSearchParams({
    status: "any",
    financial_status: "paid",
    limit: String(limit),
  });
  if (options.days && options.days > 0) {
    const since = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);
    params.set("created_at_min", since.toISOString());
  }
  const url = `https://${config.shopifyShop}/admin/api/${API_VERSION}/orders.json?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": config.shopifyToken,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Shopify orders ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as { orders?: ShopifyOrder[] };
  const orders = body.orders ?? [];
  for (const order of orders) {
    await attachProductTags(config, order);
  }
  return orders;
}

async function attachProductTags(config: AppConfig, order: ShopifyOrder): Promise<void> {
  const ids = new Set<string>();
  for (const line of order.line_items ?? []) {
    if (line.product_id != null && !line.product_tags) ids.add(String(line.product_id));
  }
  for (const id of ids) {
    const url = `https://${config.shopifyShop}/admin/api/${API_VERSION}/products/${id}.json?fields=id,tags`;
    const response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": config.shopifyToken, Accept: "application/json" },
    });
    if (!response.ok) continue;
    const body = (await response.json()) as { product?: { tags?: string } };
    const tags = body.product?.tags ?? "";
    for (const line of order.line_items ?? []) {
      if (String(line.product_id) === id) line.product_tags = tags;
    }
  }
}
