import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { createMailer } from "../src/mailer.ts";
import { loadConfig, type AppConfig } from "../src/config.ts";
import { disconnectDb, getDb, resetDatabase } from "../src/db.ts";
import { executePack, markManualPaid } from "../src/execute.ts";
import { ingestShopifyOrder } from "../src/ingest.ts";
import { approvePack, generateMonthPack, submitPack } from "../src/pack.ts";
import { buildApp } from "../src/server.ts";
import { SimulatedGateway } from "../src/stripe.ts";
import type { ShopifyOrder } from "../src/types.ts";
import type { PrismaClient } from "@prisma/client";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/nirvan_settlement_test";
process.env.ADMIN_PASSWORD = "nirvan-test-only";
process.env.SESSION_SECRET = "test-secret";
process.env.APPROVER_EMAILS = "admin@nirvanearth.com";
process.env.STRIPE_SECRET_KEY = "";
process.env.SHOPIFY_ADMIN_TOKEN = "";
process.env.APP_URL = "http://localhost:3000";

const ACTOR = "admin@nirvanearth.com";
const NOW = new Date("2026-10-12T10:00:00.000Z");

let db: PrismaClient;
let config: AppConfig;

before(async () => {
  config = loadConfig();
  db = getDb();
});

beforeEach(async () => {
  await resetDatabase(db);
});

after(async () => {
  await disconnectDb();
});

describe("intake, mapping, and hybrid payout", () => {
  it("auto-creates a non-VAT Connect vendor and leaves own products unassigned", async () => {
    await ingestShopifyOrder(db, config, sampleOrder({
      id: 7101,
      lines: [
        { id: 1, title: "Rose oil", price: 100, vendor: "Rose Co", seller: "rose" },
        { id: 2, title: "Hamper", price: 80, vendor: "Nirvan Earth", tags: ["gift-hamper"] },
      ],
    }), "test", NOW);

    const rose = await db.vendor.findFirst({ where: { webkulSellerId: "rose" } });
    assert.ok(rose);
    assert.equal(rose.vatRegistered, false);
    assert.equal(rose.payoutMethod, "stripe_connect");
    assert.equal(rose.stripeAccountId, null);

    const lines = await db.orderLine.findMany({ orderBy: { shopifyLineId: "asc" } });
    const own = lines.find((line) => line.title === "Hamper");
    const third = lines.find((line) => line.title === "Rose oil");
    assert.equal(own?.isPlatformOwn, true);
    assert.equal(own?.vendorId, null);
    assert.equal(third?.vendorId, rose.id);
    assert.equal(Number(third?.commissionAmount), 20);
    assert.equal(Number(third?.vendorNet), 80);
  });

  it("refreshes an already stored order when it becomes refunded", async () => {
    const paid = sampleOrder({ id: 7102, lines: [{ id: 1, title: "Honey", price: 50, vendor: "Gulf Honey Co", seller: "honey" }] });
    await ingestShopifyOrder(db, config, paid, "test", NOW);
    await ingestShopifyOrder(db, config, { ...paid, financial_status: "refunded" }, "test", NOW);
    const line = await db.orderLine.findFirstOrThrow();
    assert.equal(line.status, "blocked");
    assert.equal(line.blockReason, "refunded");
  });

  it("pays Connect once and records manual bank without a transfer", async () => {
    await db.vendor.create({
      data: {
        name: "Desert Botanics",
        webkulSellerId: "desert",
        externalKey: "desert",
        vatRegistered: true,
        payoutMethod: "stripe_connect",
        stripeAccountId: "acct_test_desert",
      },
    });
    await db.vendor.create({
      data: {
        name: "Gulf Honey Co",
        webkulSellerId: "honey",
        externalKey: "honey",
        vatRegistered: false,
        payoutMethod: "manual_bank",
        bankLabel: "ENBD",
        bankLast4: "4321",
      },
    });
    await ingestShopifyOrder(db, config, sampleOrder({
      id: 7103,
      taxesIncluded: true,
      lines: [
        { id: 1, title: "Oil", price: 105, vendor: "Desert Botanics", seller: "desert", vat: 5 },
        { id: 2, title: "Honey", price: 40, vendor: "Gulf Honey Co", seller: "honey" },
      ],
    }), "test", NOW);

    const gateway = new SimulatedGateway();
    const mailer = createMailer(config);
    const pack = await generateMonthPack(db, config, "2026-09", ACTOR, NOW);
    assert.equal(pack.lines.filter((line) => line.kind === "payable").length, 2);
    await submitPack(db, config, mailer, pack.id, ACTOR);
    await approvePack(db, config, mailer, pack.id, ACTOR, undefined, NOW);
    const first = await executePack(db, config, mailer, gateway, pack.id, ACTOR);
    assert.equal(gateway.calls.length, 1);
    assert.equal(first.filter((item) => item.status === "transferred").length, 1);
    assert.equal(first.filter((item) => item.status === "awaiting_manual_payment").length, 1);

    const second = await executePack(db, config, mailer, gateway, pack.id, ACTOR);
    assert.equal(gateway.calls.length, 1);
    assert.equal(second.every((item) => item.status === "skipped"), true);

    const manual = await db.settlementLine.findFirstOrThrow({ where: { payoutMethod: "manual_bank" } });
    assert.equal(manual.stripeTransferId, null);
    const recorded = await markManualPaid(db, config, mailer, manual.id, ACTOR);
    assert.equal(recorded.alreadyRecorded, false);
    assert.equal(recorded.line?.manualReference, "NE-2026-09-honey");
    assert.equal(recorded.line?.status, "manual_paid");
    const again = await markManualPaid(db, config, mailer, manual.id, ACTOR);
    assert.equal(again.alreadyRecorded, true);
    const audits = await db.auditEvent.count({ where: { action: "manual_payment.recorded" } });
    assert.equal(audits, 1);
    const attempts = await db.transferAttempt.count({ where: { settlementLineId: manual.id } });
    assert.equal(attempts, 0);
    const closed = await db.monthPack.findUniqueOrThrow({ where: { id: pack.id } });
    assert.equal(closed.status, "closed");
  });

  it("accepts a signed orders/paid webhook and rejects a bad signature", async () => {
    const webhookConfig = { ...config, shopifyApiSecret: "webhook_secret" };
    const app = await buildApp({ config: webhookConfig, db, gateway: new SimulatedGateway(), mailer: createMailer(config) });
    const payload = JSON.stringify(sampleOrder({
      id: 7104,
      lines: [{ id: 9, title: "Soap", price: 25, vendor: "Soap Co", seller: "soap" }],
    }));
    const hmac = createHmac("sha256", webhookConfig.shopifyApiSecret).update(payload, "utf8").digest("base64");
    const rejected = await app.inject({
      method: "POST",
      url: "/api/shopify/webhooks",
      headers: { "content-type": "application/json", "x-shopify-topic": "orders/paid", "x-shopify-hmac-sha256": "nope" },
      payload,
    });
    assert.equal(rejected.statusCode, 401);

    const accepted = await app.inject({
      method: "POST",
      url: "/api/shopify/webhooks",
      headers: { "content-type": "application/json", "x-shopify-topic": "orders/paid", "x-shopify-hmac-sha256": hmac },
      payload,
    });
    assert.equal(accepted.statusCode, 200);
    const stored = await db.orderSnapshot.findUnique({ where: { shopifyOrderId: "7104" } });
    assert.ok(stored);
    const vendor = await db.vendor.findFirst({ where: { webkulSellerId: "soap" } });
    assert.ok(vendor);
    await app.close();
  });

  it("stores only the bank last4 and soft-deactivates a vendor", async () => {
    const app = await buildApp({ config, db, gateway: new SimulatedGateway(), mailer: createMailer(config) });
    const created = await app.inject({
      method: "POST",
      url: "/api/vendors",
      headers: { "x-actor-email": ACTOR, "content-type": "application/json" },
      payload: {
        name: "Manual Seller",
        webkulSellerId: "manual-1",
        payoutMethod: "manual_bank",
        iban: "AE0703312345678904321",
        bankLabel: "ENBD",
      },
    });
    assert.equal(created.statusCode, 200);
    const body = created.json().vendor;
    assert.equal(body.bankLast4, "4321");
    assert.equal(body.payoutMethod, "manual_bank");
    assert.equal(JSON.stringify(body).includes("4321") && JSON.stringify(body).includes("AE07"), false);

    const bad = await app.inject({
      method: "POST",
      url: "/api/vendors",
      headers: { "x-actor-email": ACTOR, "content-type": "application/json" },
      payload: { name: "Bad Acct", stripeAccountId: "not-an-account" },
    });
    assert.equal(bad.statusCode, 400);

    const off = await app.inject({
      method: "POST",
      url: `/api/vendors/${body.id}/deactivate`,
      headers: { "x-actor-email": ACTOR },
    });
    assert.equal(off.json().vendor.active, false);
    await app.close();
  });
});

function sampleOrder(input: {
  id: number;
  taxesIncluded?: boolean;
  lines: Array<{ id: number; title: string; price: number; vendor: string; seller?: string; vat?: number; tags?: string[] }>;
}): ShopifyOrder {
  return {
    id: input.id,
    name: `#${input.id}`,
    currency: "AED",
    financial_status: "paid",
    fulfillment_status: "fulfilled",
    processed_at: "2026-09-10T08:00:00.000Z",
    taxes_included: input.taxesIncluded ?? false,
    shipping_lines: [{ price: "15.00" }],
    fulfillments: [{ created_at: "2026-09-11T08:00:00.000Z", line_items: input.lines.map((line) => ({ id: line.id })) }],
    line_items: input.lines.map((line) => ({
      id: line.id,
      title: line.title,
      quantity: 1,
      price: line.price,
      vendor: line.vendor,
      product_id: line.id,
      product_tags: line.tags ?? [],
      properties: line.seller ? [{ name: "webkul_seller_id", value: line.seller }] : [],
      tax_lines: line.vat ? [{ price: line.vat, title: "VAT" }] : [],
    })),
  };
}
