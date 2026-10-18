import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { loadConfig } from "../src/config.ts";
import { buildApp } from "../src/server.ts";
import {
  isValidShopifyDomain,
  verifyShopifyHmac,
  getShopifyAccessToken,
  fetchPaidOrders,
} from "../src/shopify.ts";

test("Shopify OAuth - domain validation", () => {
  assert.equal(isValidShopifyDomain("t91jg6-qq.myshopify.com"), true);
  assert.equal(isValidShopifyDomain("my-shop.myshopify.com"), true);
  assert.equal(isValidShopifyDomain("shop123.myshopify.com"), true);

  assert.equal(isValidShopifyDomain("evil.com"), false);
  assert.equal(isValidShopifyDomain("t91jg6-qq.myshopify.com.evil.com"), false);
  assert.equal(isValidShopifyDomain("https://t91jg6-qq.myshopify.com"), false);
  assert.equal(isValidShopifyDomain("-bad.myshopify.com"), false);
  assert.equal(isValidShopifyDomain(""), false);
});

test("Shopify OAuth - HMAC verification", () => {
  const secret = "test_shopify_secret_123";
  const params: Record<string, string> = {
    code: "auth_code_xyz",
    shop: "t91jg6-qq.myshopify.com",
    state: "random_state_123",
    timestamp: "1234567890",
  };
  const message = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const validHmac = createHmac("sha256", secret).update(message).digest("hex");

  assert.equal(verifyShopifyHmac({ ...params, hmac: validHmac }, secret), true);
  assert.equal(verifyShopifyHmac({ ...params, hmac: "invalid_hmac" }, secret), false);
});

test("Shopify OAuth - token resolution from DB and fallback", async () => {
  const baseConfig = loadConfig({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://mock",
    SHOPIFY_ADMIN_TOKEN: "fallback_token_123",
  });

  // Fallback when DB has no session
  const mockDbEmpty = {
    shopSession: {
      findUnique: async () => null,
    },
  } as any;
  const tokenFromFallback = await getShopifyAccessToken(baseConfig, mockDbEmpty);
  assert.equal(tokenFromFallback, "fallback_token_123");

  // Preferred from DB
  const mockDbWithSession = {
    shopSession: {
      findUnique: async ({ where }: any) => {
        if (where.shop === "t91jg6-qq.myshopify.com") {
          return { accessToken: "db_stored_oauth_token", shop: where.shop };
        }
        return null;
      },
    },
  } as any;
  const tokenFromDb = await getShopifyAccessToken(baseConfig, mockDbWithSession);
  assert.equal(tokenFromDb, "db_stored_oauth_token");

  // Error when neither is available
  const noTokenConfig = { ...baseConfig, shopifyToken: "" };
  await assert.rejects(
    async () => getShopifyAccessToken(noTokenConfig, mockDbEmpty),
    /Shopify store.*is not connected/i,
  );
});

test("Shopify OAuth - /shopify/auth and /shopify/callback HTTP flow", async () => {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://mock",
    SHOPIFY_API_KEY: "mock_client_id",
    SHOPIFY_API_SECRET: "mock_client_secret",
    SHOPIFY_SHOP: "t91jg6-qq.myshopify.com",
    APP_URL: "https://nirvanearth-production.up.railway.app",
  });

  const storedSessions: Record<string, any> = {};
  const auditLogs: any[] = [];
  const mockDb = {
    $queryRaw: async () => [{ 1: 1 }],
    adminUser: { findUnique: async () => null },
    shopSession: {
      findUnique: async ({ where }: any) => storedSessions[where.shop] ?? null,
      upsert: async ({ where, create, update }: any) => {
        const session = { ...create, ...update, shop: where.shop };
        storedSessions[where.shop] = session;
        return session;
      },
    },
    auditEvent: {
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return { id: "audit_1", ...data };
      },
    },
  } as any;

  const app = await buildApp({
    config,
    db: mockDb,
    gateway: { mode: "test_gateway", executeTransfer: async () => ({ id: "m", status: "s", raw: {} }) },
  });

  // 1. Initiate OAuth
  const authRes = await app.inject({
    method: "GET",
    url: "/shopify/auth?shop=t91jg6-qq.myshopify.com",
  });
  assert.equal(authRes.statusCode, 302);
  const redirectLocation = authRes.headers.location as string;
  assert.ok(redirectLocation.startsWith("https://t91jg6-qq.myshopify.com/admin/oauth/authorize"));
  assert.ok(redirectLocation.includes("client_id=mock_client_id"));
  assert.ok(redirectLocation.includes("redirect_uri="));

  const setCookie = authRes.headers["set-cookie"];
  const cookieHeader = Array.isArray(setCookie) ? setCookie.join("; ") : String(setCookie);
  const stateMatch = cookieHeader.match(/shopify_oauth_state=([^;]+)/);
  assert.ok(stateMatch, "shopify_oauth_state cookie must be set");
  const state = stateMatch[1];

  // 2. Reject callback if state is mismatched or missing
  const badStateRes = await app.inject({
    method: "GET",
    url: "/shopify/callback?code=some_code&shop=t91jg6-qq.myshopify.com&state=wrong_state",
    headers: { cookie: `shopify_oauth_state=${state}` },
  });
  assert.equal(badStateRes.statusCode, 403);

  // 3. Mock fetch for code exchange and verify success callback
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/admin/oauth/access_token")) {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.client_id, "mock_client_id");
        assert.equal(body.client_secret, "mock_client_secret");
        assert.equal(body.code, "valid_exchange_code");
        return new Response(
          JSON.stringify({
            access_token: "shpat_live_test_access_token_mock",
            scope: "read_orders,read_products",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return originalFetch(input, init);
    };

    const goodCallbackRes = await app.inject({
      method: "GET",
      url: `/shopify/callback?code=valid_exchange_code&shop=t91jg6-qq.myshopify.com&state=${state}`,
      headers: { cookie: `shopify_oauth_state=${state}` },
    });
    assert.equal(goodCallbackRes.statusCode, 302);
    assert.equal(goodCallbackRes.headers.location, "/?shopify=connected");

    // Verify token stored in DB
    assert.equal(
      storedSessions["t91jg6-qq.myshopify.com"]?.accessToken,
      "shpat_live_test_access_token_mock",
    );
    // Verify audit event created without exposing token
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "shopify_oauth_connected");
    assert.equal(JSON.stringify(auditLogs[0]).includes("shpat_live"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Shopify API client - fetchPaidOrders uses stored token in header", async () => {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://mock",
    SHOPIFY_SHOP: "t91jg6-qq.myshopify.com",
    SHOPIFY_ADMIN_TOKEN: "",
  });

  const mockDb = {
    shopSession: {
      findUnique: async () => ({
        shop: "t91jg6-qq.myshopify.com",
        accessToken: "shpat_stored_token_abc",
      }),
    },
  } as any;

  let requestHeaders: Headers | undefined;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/admin/api/2024-10/orders.json")) {
        requestHeaders = new Headers(init?.headers);
        return new Response(
          JSON.stringify({
            orders: [
              {
                id: 999111,
                name: "#1001",
                financial_status: "paid",
                currency: "AED",
                line_items: [],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return originalFetch(input, init);
    };

    const orders = await fetchPaidOrders(config, 10, mockDb);
    assert.equal(orders.length, 1);
    assert.equal(orders[0].id, 999111);
    assert.equal(requestHeaders?.get("X-Shopify-Access-Token"), "shpat_stored_token_abc");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Fastify - handles empty JSON body gracefully on POST requests", async () => {
  const config = loadConfig({
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    SHOPIFY_API_KEY: "dummy_key",
    SHOPIFY_API_SECRET: "dummy_secret",
  });
  const mockDb = {
    $queryRaw: async () => [{ 1: 1 }],
  } as any;
  const app = await buildApp({ config, db: mockDb });

  // Test POST with Content-Type application/json and empty string body
  const resEmptyBody = await app.inject({
    method: "POST",
    url: "/api/sync",
    headers: { "content-type": "application/json" },
    payload: "",
  });

  // Should NOT throw 500 "Body cannot be empty when content-type is set to 'application/json'"
  // Since no session cookie is provided, it should reach actorFromRequest and return 401 "Sign in required."
  assert.equal(resEmptyBody.statusCode, 401);
  assert.deepEqual(JSON.parse(resEmptyBody.payload), { error: "Sign in required." });
});
