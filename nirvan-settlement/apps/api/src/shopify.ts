import { createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./config.ts";
import { HttpError } from "./config.ts";
import type { ShopifyOrder } from "./types.ts";

const API_VERSION = "2024-10";

export function isValidShopifyDomain(shop: string): boolean {
  if (!shop || typeof shop !== "string") return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop.toLowerCase().trim());
}

export function verifyShopifyHmac(
  queryParams: Record<string, unknown>,
  apiSecret: string,
): boolean {
  const hmac = queryParams.hmac;
  if (!hmac || typeof hmac !== "string" || !apiSecret) return false;
  const message = Object.keys(queryParams)
    .filter((k) => k !== "hmac" && k !== "signature")
    .sort()
    .map((k) => {
      const val = queryParams[k];
      return `${k}=${Array.isArray(val) ? val.join(",") : String(val ?? "")}`;
    })
    .join("&");
  const calculated = createHmac("sha256", apiSecret).update(message).digest("hex");
  const left = Buffer.from(calculated, "utf-8");
  const right = Buffer.from(hmac, "utf-8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function getShopifyAccessToken(
  config: AppConfig,
  db?: PrismaClient,
  shop?: string,
): Promise<string> {
  const targetShop = (shop ?? config.shopifyShop).toLowerCase().trim();
  if (db) {
    try {
      const session = await db.shopSession.findUnique({ where: { shop: targetShop } });
      if (session?.accessToken) {
        return session.accessToken;
      }
    } catch {
      // Table might not be ready in isolated unit tests; continue to fallback
    }
  }
  if (config.shopifyToken && !config.shopifyToken.startsWith("paste_")) {
    return config.shopifyToken;
  }
  throw new HttpError(
    401,
    `Shopify store (${targetShop}) is not connected. Please visit /shopify/auth to authenticate.`,
  );
}

export async function exchangeShopifyCode(
  shop: string,
  code: string,
  config: AppConfig,
): Promise<{ accessToken: string; scope: string }> {
  const cleanShop = shop.toLowerCase().trim();
  if (!isValidShopifyDomain(cleanShop)) {
    throw new HttpError(400, "Invalid shop domain. Must end with .myshopify.com");
  }
  if (!config.shopifyApiKey || !config.shopifyApiSecret) {
    throw new HttpError(500, "SHOPIFY_API_KEY and SHOPIFY_API_SECRET must be configured.");
  }
  const url = `https://${cleanShop}/admin/oauth/access_token`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: config.shopifyApiKey,
      client_secret: config.shopifyApiSecret,
      code,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new HttpError(response.status, `Shopify OAuth exchange failed: ${errorText}`);
  }
  const data = (await response.json()) as { access_token?: string; scope?: string };
  if (!data.access_token) {
    throw new HttpError(500, "Shopify OAuth response did not contain an access_token.");
  }
  return { accessToken: data.access_token, scope: data.scope ?? "" };
}

export async function fetchPaidOrders(
  config: AppConfig,
  limitOrOptions: number | { limit?: number; days?: number; shop?: string } = 50,
  db?: PrismaClient,
): Promise<ShopifyOrder[]> {
  const options = typeof limitOrOptions === "number" ? { limit: limitOrOptions } : limitOrOptions;
  const targetShop = (options.shop ?? config.shopifyShop).toLowerCase().trim();
  const token = await getShopifyAccessToken(config, db, targetShop);
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
  const url = `https://${targetShop}/admin/api/${API_VERSION}/orders.json?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": token,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new HttpError(401, "Shopify token invalid or expired. Please visit /shopify/auth to reconnect.");
    }
    throw new Error(`Shopify orders ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as { orders?: ShopifyOrder[] };
  const orders = body.orders ?? [];
  for (const order of orders) {
    await attachProductTags(config, order, token, targetShop);
  }
  return orders;
}

async function attachProductTags(
  config: AppConfig,
  order: ShopifyOrder,
  token: string,
  targetShop: string,
): Promise<void> {
  const ids = new Set<string>();
  for (const line of order.line_items ?? []) {
    if (line.product_id != null && !line.product_tags) ids.add(String(line.product_id));
  }
  for (const id of ids) {
    const url = `https://${targetShop}/admin/api/${API_VERSION}/products/${id}.json?fields=id,tags`;
    const response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
    });
    if (!response.ok) continue;
    const body = (await response.json()) as { product?: { tags?: string } };
    const tags = body.product?.tags ?? "";
    for (const line of order.line_items ?? []) {
      if (String(line.product_id) === id) line.product_tags = tags;
    }
  }
}

export function verifyShopifyWebhookHmac(rawBody: string, hmacHeader: string | undefined, apiSecret: string): boolean {
  if (!hmacHeader || !apiSecret || !rawBody) return false;
  const digest = createHmac("sha256", apiSecret).update(rawBody, "utf8").digest("base64");
  const left = Buffer.from(digest);
  const right = Buffer.from(hmacHeader);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Shopify REST `Link` header. Returns the `rel="next"` URL. */
export function nextPageUrl(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match?.[1]) return match[1];
  }
  return null;
}

export interface OrderPage {
  orders: ShopifyOrder[];
  link: string | null;
}

/** Walks Shopify cursor pages. Stops on a repeated URL or `maxPages`. */
export async function followOrderPages(
  first: OrderPage,
  getNext: (url: string) => Promise<OrderPage>,
  maxPages = 40,
): Promise<{ orders: ShopifyOrder[]; truncated: boolean }> {
  const orders: ShopifyOrder[] = [];
  const seen = new Set<string>();
  const take = (batch: ShopifyOrder[]) => {
    for (const order of batch) {
      const id = String(order.id);
      if (seen.has(id)) continue;
      seen.add(id);
      orders.push(order);
    }
  };
  take(first.orders);
  let link = first.link;
  let pages = 1;
  const visited = new Set<string>();
  while (link && pages < maxPages) {
    if (visited.has(link)) break;
    visited.add(link);
    const page = await getNext(link);
    take(page.orders);
    link = page.link;
    pages += 1;
  }
  return { orders, truncated: Boolean(link) && pages >= maxPages };
}

async function shopifyGet(
  config: AppConfig,
  db: PrismaClient | undefined,
  url: string,
): Promise<{ body: unknown; link: string | null }> {
  const token = await getShopifyAccessToken(config, db);
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new HttpError(401, "Shopify token invalid or expired. Please visit /shopify/auth to reconnect.");
    }
    throw new Error(`Shopify ${response.status}`);
  }
  return { body: await response.json(), link: response.headers.get("link") };
}

async function pullOrders(
  config: AppConfig,
  db: PrismaClient | undefined,
  startUrl: string,
  maxPages = 40,
): Promise<{ orders: ShopifyOrder[]; truncated: boolean }> {
  const token = await getShopifyAccessToken(config, db);
  const tagCache = new Map<string, string>();
  const load = async (url: string): Promise<OrderPage> => {
    const { body, link } = await shopifyGet(config, db, url);
    const orders = ((body as { orders?: ShopifyOrder[] }).orders ?? []).slice();
    for (const order of orders) {
      await attachProductTagsCached(config, order, token, config.shopifyShop, tagCache);
    }
    return { orders, link };
  };
  const first = await load(startUrl);
  return followOrderPages(first, load, maxPages);
}

async function attachProductTagsCached(
  config: AppConfig,
  order: ShopifyOrder,
  token: string,
  targetShop: string,
  cache: Map<string, string>,
): Promise<void> {
  const ids = new Set<string>();
  for (const line of order.line_items ?? []) {
    if (line.product_id != null && !line.product_tags) ids.add(String(line.product_id));
  }
  for (const id of ids) {
    if (cache.has(id)) {
      const tags = cache.get(id) ?? "";
      for (const line of order.line_items ?? []) {
        if (String(line.product_id) === id) line.product_tags = tags;
      }
      continue;
    }
    const url = `https://${targetShop}/admin/api/${API_VERSION}/products/${id}.json?fields=id,tags`;
    const response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
    });
    const tags = response.ok
      ? (((await response.json()) as { product?: { tags?: string } }).product?.tags ?? "")
      : "";
    cache.set(id, tags);
    for (const line of order.line_items ?? []) {
      if (String(line.product_id) === id) line.product_tags = tags;
    }
  }
}

export async function fetchOrderById(
  config: AppConfig,
  db: PrismaClient | undefined,
  orderId: string | number,
): Promise<ShopifyOrder> {
  const shop = config.shopifyShop.toLowerCase().trim();
  const token = await getShopifyAccessToken(config, db, shop);
  const url = `https://${shop}/admin/api/${API_VERSION}/orders/${orderId}.json`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Shopify order ${orderId} ${response.status}`);
  }
  const body = (await response.json()) as { order?: ShopifyOrder };
  if (!body.order) throw new Error(`Shopify order ${orderId} was empty.`);
  await attachProductTags(config, body.order, token, shop);
  return body.order;
}

export async function fetchAllPaidOrders(
  config: AppConfig,
  db: PrismaClient | undefined,
  options: { createdAtMin?: Date; maxPages?: number } = {},
): Promise<{ orders: ShopifyOrder[]; truncated: boolean }> {
  const shop = config.shopifyShop.toLowerCase().trim();
  const params = new URLSearchParams({
    status: "any",
    financial_status: "paid",
    limit: "250",
  });
  if (options.createdAtMin) params.set("created_at_min", options.createdAtMin.toISOString());
  const url = `https://${shop}/admin/api/${API_VERSION}/orders.json?${params.toString()}`;
  return pullOrders(config, db, url, options.maxPages ?? 40);
}

export async function fetchUpdatedOrders(
  config: AppConfig,
  db: PrismaClient | undefined,
  updatedAtMin: Date,
  maxPages = 40,
): Promise<{ orders: ShopifyOrder[]; truncated: boolean }> {
  const shop = config.shopifyShop.toLowerCase().trim();
  const params = new URLSearchParams({
    status: "any",
    updated_at_min: updatedAtMin.toISOString(),
    limit: "250",
  });
  const url = `https://${shop}/admin/api/${API_VERSION}/orders.json?${params.toString()}`;
  return pullOrders(config, db, url, maxPages);
}

const ORDER_WEBHOOK_TOPICS = ["orders/paid", "orders/updated", "refunds/create"] as const;

export async function registerOrderWebhooks(
  config: AppConfig,
  db?: PrismaClient,
): Promise<{ created: string[]; existing: string[] }> {
  const shop = config.shopifyShop.toLowerCase().trim();
  const token = await getShopifyAccessToken(config, db, shop);
  const address = `${config.appUrl.replace(/\/+$/, "")}/api/shopify/webhooks`;
  const listUrl = `https://${shop}/admin/api/${API_VERSION}/webhooks.json?limit=250`;
  const listed = await fetch(listUrl, {
    headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
  });
  if (!listed.ok) throw new Error(`Shopify webhook list ${listed.status}`);
  const current = ((await listed.json()) as { webhooks?: Array<{ topic?: string; address?: string }> }).webhooks ?? [];
  const created: string[] = [];
  const existing: string[] = [];
  for (const topic of ORDER_WEBHOOK_TOPICS) {
    const found = current.some((hook) => hook.topic === topic && hook.address === address);
    if (found) {
      existing.push(topic);
      continue;
    }
    const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/webhooks.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
    });
    if (!response.ok) throw new Error(`Shopify webhook ${topic} ${response.status}`);
    created.push(topic);
  }
  return { created, existing };
}
