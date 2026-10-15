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
