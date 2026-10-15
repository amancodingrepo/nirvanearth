import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createMailer } from "../src/mailer.ts";
import { loadConfig, type AppConfig } from "../src/config.ts";
import { disconnectDb, getDb, resetDatabase } from "../src/db.ts";
import { executePack } from "../src/execute.ts";
import { ingestShopifyOrder } from "../src/ingest.ts";
import { money } from "../src/money-db.ts";
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
process.env.NOTIFY_EMAIL = "admin@nirvanearth.com";
process.env.EMAIL_FROM = "settlement@localhost";
process.env.STRIPE_SECRET_KEY = "";
process.env.SHOPIFY_ADMIN_TOKEN = "";
process.env.RETURN_WINDOW_DAYS = "14";
process.env.COMMISSION_RATE = "0.20";
process.env.PLATFORM_OWN_TAGS = "nirvan-own,gift-hamper";
process.env.PLATFORM_OWN_VENDOR_NAMES = "Nirvan Earth";
process.env.PLATFORM_OWN_PRODUCT_IDS = "";
process.env.APP_URL = "http://localhost:3000";

const ACTOR = "admin@nirvanearth.com";
const NOW = new Date("2026-10-12T10:00:00.000Z");

let db: PrismaClient;
let config: AppConfig;

before(async () => {
  config = loadConfig();
  db = getDb();
  const rows = await db.$queryRawUnsafe<Array<{ name: string }>>("SELECT current_database() AS name");
  assert.equal(rows[0]?.name, "nirvan_settlement_test");
});

beforeEach(async () => {
  await resetDatabase(db);
});

after(async () => {
  await disconnectDb();
});

describe("settlement matrix", () => {
  it("refuses a live Stripe key", () => {
    assert.throws(() =>
      loadConfig({
        NODE_ENV: "development",
        DATABASE_URL: process.env.DATABASE_URL,
        STRIPE_SECRET_KEY: "sk_live_not_allowed",
      }),
    );
  });

  it("1 single vendor: 20% and shipping kept separate", async () => {
    await vendor("Desert Botanics", { stripeAccountId: "acct_desert" });
    await ingest(order({
      id: 1,
      paidAt: "2026-09-02T08:00:00.000Z",
      fulfilledAt: "2026-09-02T12:00:00.000Z",
      shipping: 15,
      lines: [{ id: 11, title: "Oil", price: 100, vendor: "Desert Botanics" }],
    }));
    const snapshot = await db.orderSnapshot.findFirstOrThrow();
    assert.equal(money(snapshot.shippingTotal), 15);
    assert.equal(snapshot.shippingAllocation, "unassigned");
    const pack = await generateMonthPack(db, config, "2026-09", ACTOR, NOW);
    const payable = pack.lines.filter((line) => line.kind === "payable");
    assert.equal(payable.length, 1);
    assert.equal(money(payable[0]!.commissionBaseSum), 100);
    assert.equal(money(payable[0]!.commissionSum), 20);
    assert.equal(money(payable[0]!.vendorNetSum), 80);
  });

  it("2 mixed cart: one settlement line and one transfer per vendor", async () => {
    await vendor("Desert Botanics", { stripeAccountId: "acct_desert" });
    await vendor("Gulf Honey Co", { stripeAccountId: "acct_honey" });
    await ingest(order({
      id: 2,
      paidAt: "2026-09-03T08:00:00.000Z",
      fulfilledAt: "2026-09-03T12:00:00.000Z",
      lines: [
        { id: 21, title: "Oil", price: 100, vendor: "Desert Botanics" },
        { id: 22, title: "Honey", price: 50, vendor: "Gulf Honey Co" },
      ],
    }));
    const gateway = new SimulatedGateway();
    const results = await payMonth("2026-09", gateway);
    assert.equal(results.length, 2);
    assert.equal(gateway.calls.length, 2);
    assert.equal(new Set(results.map((result) => result.transferId)).size, 2);
  });

  it("3 own product: no vendor settlement line", async () => {
    await ingest(order({
      id: 3,
      paidAt: "2026-09-04T08:00:00.000Z",
      fulfilledAt: "2026-09-04T12:00:00.000Z",
      lines: [{ id: 31, title: "Hamper", price: 180, vendor: "Nirvan Earth", tags: ["gift-hamper"] }],
    }));
    const line = await db.orderLine.findFirstOrThrow();
    assert.equal(line.isPlatformOwn, true);
    assert.equal(line.vendorId, null);
    const pack = await generateMonthPack(db, config, "2026-09", ACTOR, NOW);
    assert.equal(pack.lines.length, 0);
  });

  it("4 VAT vendor: VAT is out of the commission base", async () => {
    await vendor("Desert Botanics", { vatRegistered: true, stripeAccountId: "acct_desert" });
    await ingest(order({
      id: 4,
      paidAt: "2026-09-02T08:00:00.000Z",
      fulfilledAt: "2026-09-02T12:00:00.000Z",
      taxesIncluded: true,
      lines: [{ id: 41, title: "Oil", price: 105, vat: 5, vendor: "Desert Botanics" }],
    }));
    const line = await db.orderLine.findFirstOrThrow();
    assert.equal(money(line.vendorVat), 5);
    assert.equal(money(line.commissionBase), 100);
    assert.equal(money(line.commissionAmount), 20);
    assert.equal(money(line.vendorNet), 80);
  });

  it("5 non-VAT vendor: no vendor VAT", async () => {
    await vendor("Gulf Honey Co", { vatRegistered: false });
    await ingest(order({
      id: 5,
      paidAt: "2026-09-02T08:00:00.000Z",
      fulfilledAt: "2026-09-02T12:00:00.000Z",
      taxesIncluded: false,
      lines: [{ id: 51, title: "Honey", price: 100, vat: 5, vendor: "Gulf Honey Co" }],
    }));
    const line = await db.orderLine.findFirstOrThrow();
    assert.equal(money(line.vendorVat), 0);
    assert.equal(money(line.commissionBase), 100);
    assert.equal(money(line.commissionAmount), 20);
  });

  it("6 discount: commission is on the post-discount value", async () => {
    await vendor("Desert Botanics");
    await ingest(order({
      id: 6,
      paidAt: "2026-09-02T08:00:00.000Z",
      fulfilledAt: "2026-09-02T12:00:00.000Z",
      lines: [{ id: 61, title: "Oil", price: 100, discount: 10, vendor: "Desert Botanics" }],
    }));
    const line = await db.orderLine.findFirstOrThrow();
    assert.equal(money(line.commissionBase), 90);
    assert.equal(money(line.commissionAmount), 18);
    assert.equal(money(line.vendorNet), 72);
  });

  it("7 open refund: blocked and not transferred", async () => {
    await vendor("Desert Botanics", { stripeAccountId: "acct_desert" });
    await ingest(order({
      id: 7,
      paidAt: "2026-09-02T08:00:00.000Z",
      fulfilledAt: "2026-09-02T12:00:00.000Z",
      lines: [{ id: 71, title: "Oil", price: 100, vendor: "Desert Botanics" }],
      refunds: [{ id: 701, lineId: 71, amount: 100 }],
    }));
    const line = await db.orderLine.findFirstOrThrow();
    assert.equal(line.status, "blocked");
    assert.equal(line.blockReason, "open_adjustment");
    const gateway = new SimulatedGateway();
    const pack = await generateMonthPack(db, config, "2026-09", ACTOR, NOW);
    assert.equal(pack.lines.filter((item) => item.kind === "payable").length, 0);
    await submitPack(db, config, createMailer(config), pack.id, ACTOR);
    await approvePack(db, config, createMailer(config), pack.id, ACTOR, undefined, NOW);
    const results = await executePack(db, config, createMailer(config), gateway, pack.id, ACTOR);
    assert.equal(results.length, 0);
    assert.equal(gateway.calls.length, 0);
  });

  it("8 open chargeback: not qualified", async () => {
    await vendor("Desert Botanics");
    await ingest(order({
      id: 8,
      paidAt: "2026-09-02T08:00:00.000Z",
      fulfilledAt: "2026-09-02T12:00:00.000Z",
      lines: [{ id: 81, title: "Oil", price: 100, vendor: "Desert Botanics" }],
      adjustments: [{ type: "chargeback", amount: 100, lineId: 81 }],
    }));
    const line = await db.orderLine.findFirstOrThrow();
    assert.equal(line.status, "blocked");
    const adjustment = await db.adjustment.findFirstOrThrow();
    assert.equal(adjustment.type, "chargeback");
    assert.equal(adjustment.status, "open");
  });

  it("9 approve then transfer: id stored, email and audit written", async () => {
    await vendor("Desert Botanics", { stripeAccountId: "acct_desert" });
    await ingest(order({
      id: 9,
      paidAt: "2026-09-02T08:00:00.000Z",
      fulfilledAt: "2026-09-02T12:00:00.000Z",
      lines: [{ id: 91, title: "Oil", price: 100, vendor: "Desert Botanics" }],
    }));
    const gateway = new SimulatedGateway();
    const results = await payMonth("2026-09", gateway);
    assert.equal(results[0]?.status, "transferred");
    assert.ok(results[0]?.transferId);
    const stored = await db.settlementLine.findFirstOrThrow({ where: { kind: "payable" } });
    assert.equal(stored.status, "transferred");
    assert.equal(stored.stripeTransferId, results[0]?.transferId);
    const email = await db.emailMessage.findFirst({ where: { subject: { contains: "Transfer succeeded" } } });
    assert.ok(email);
    assert.match(email!.body, new RegExp(results[0]!.transferId!));
    const audit = await db.auditEvent.findFirst({ where: { action: "transfer.executed" } });
    assert.ok(audit);
  });

  it("10 transfer failure is stored and does not crash", async () => {
    await vendor("Desert Botanics", { stripeAccountId: "acct_invalid" });
    await ingest(order({
      id: 10,
      paidAt: "2026-09-02T08:00:00.000Z",
      fulfilledAt: "2026-09-02T12:00:00.000Z",
      lines: [{ id: 101, title: "Oil", price: 100, vendor: "Desert Botanics" }],
    }));
    const gateway = new SimulatedGateway();
    const results = await payMonth("2026-09", gateway);
    assert.equal(results[0]?.status, "failed");
    assert.match(results[0]?.error ?? "", /invalid_destination/);
    const line = await db.settlementLine.findFirstOrThrow({ where: { kind: "payable" } });
    assert.equal(line.status, "failed");
    assert.equal(line.stripeTransferId, null);
    const pack = await db.monthPack.findFirstOrThrow();
    assert.equal(pack.status, "executing");
  });

  it("11 a second execute does not create a second transfer", async () => {
    await vendor("Desert Botanics", { stripeAccountId: "acct_desert" });
    await ingest(order({
      id: 11,
      paidAt: "2026-09-02T08:00:00.000Z",
      fulfilledAt: "2026-09-02T12:00:00.000Z",
      lines: [{ id: 111, title: "Oil", price: 100, vendor: "Desert Botanics" }],
    }));
    const gateway = new SimulatedGateway();
    const pack = await generateMonthPack(db, config, "2026-09", ACTOR, NOW);
    await submitPack(db, config, createMailer(config), pack.id, ACTOR);
    await approvePack(db, config, createMailer(config), pack.id, ACTOR, undefined, NOW);
    await executePack(db, config, createMailer(config), gateway, pack.id, ACTOR);
    await db.monthPack.update({ where: { id: pack.id }, data: { status: "approved" } });
    const second = await executePack(db, config, createMailer(config), gateway, pack.id, ACTOR);
    assert.equal(gateway.calls.length, 1);
    assert.equal(await db.transferAttempt.count(), 1);
    assert.equal(second[0]?.status, "skipped");
  });

  it("12 unqualified at month cut-off is held, then rolls into the next month", async () => {
    await vendor("Desert Botanics", { stripeAccountId: "acct_desert" });
    await ingest(order({
      id: 12,
      paidAt: "2026-10-02T08:00:00.000Z",
      fulfilledAt: "2026-10-02T12:00:00.000Z",
      lines: [{ id: 121, title: "Oil", price: 100, vendor: "Desert Botanics" }],
    }));
    const cutoff = await generateMonthPack(db, config, "2026-10", ACTOR, NOW);
    assert.equal(cutoff.lines.filter((line) => line.kind === "payable").length, 0);
    const held = cutoff.lines.filter((line) => line.kind === "held");
    assert.equal(held.length, 1);
    assert.equal(held[0]?.status, "blocked");

    await submitPack(db, config, createMailer(config), cutoff.id, ACTOR);
    await approvePack(db, config, createMailer(config), cutoff.id, ACTOR, undefined, NOW);
    const gateway = new SimulatedGateway();
    await executePack(db, config, createMailer(config), gateway, cutoff.id, ACTOR);
    assert.equal(gateway.calls.length, 0);

    const later = new Date("2026-10-20T10:00:00.000Z");
    const november = await generateMonthPack(db, config, "2026-11", "cli", later);
    const payable = november.lines.filter((line) => line.kind === "payable");
    assert.equal(payable.length, 1);
    assert.equal(money(payable[0]!.vendorNetSum), 80);
    assert.equal(payable[0]?.status, "qualified");
  });

  it("serves login, pack approval, and execute over HTTP", async () => {
    await db.adminUser.create({ data: { email: ACTOR } });
    await vendor("Desert Botanics", { stripeAccountId: "acct_desert" });
    await ingest(order({
      id: 13,
      paidAt: "2026-09-02T08:00:00.000Z",
      fulfilledAt: "2026-09-02T12:00:00.000Z",
      lines: [{ id: 131, title: "Oil", price: 100, vendor: "Desert Botanics" }],
    }));
    const gateway = new SimulatedGateway();
    const app = await buildApp({ config, db, gateway, mailer: createMailer(config) });
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: ACTOR, password: "nirvan-test-only" },
    });
    assert.equal(login.statusCode, 200);
    const setCookie = login.headers["set-cookie"];
    const cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0];

    const home = await app.inject({ method: "GET", url: "/" });
    assert.equal(home.statusCode, 200);
    assert.match(home.body, /settlement ledger/i);

    const created = await app.inject({
      method: "POST",
      url: "/api/packs/generate",
      headers: { cookie },
      payload: { yearMonth: "2026-09" },
    });
    assert.equal(created.statusCode, 200);
    const packId = created.json().pack.id as string;

    const submitted = await app.inject({
      method: "POST",
      url: `/api/packs/${packId}/submit`,
      headers: { cookie },
    });
    assert.equal(submitted.json().pack.status, "pending_approval");

    const approved = await app.inject({
      method: "POST",
      url: `/api/packs/${packId}/approve`,
      headers: { cookie },
      payload: {},
    });
    assert.equal(approved.json().pack.status, "approved");

    const stranger = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "other@example.com", password: "nirvan-test-only" },
    });
    assert.equal(stranger.statusCode, 401);

    const executed = await app.inject({
      method: "POST",
      url: `/api/packs/${packId}/execute`,
      headers: { cookie },
    });
    assert.equal(executed.statusCode, 200);
    assert.equal(executed.json().results[0].status, "transferred");
    assert.equal(gateway.calls.length, 1);
    await app.close();
  });
});

async function vendor(
  name: string,
  extra: { vatRegistered?: boolean; stripeAccountId?: string; externalKey?: string } = {},
) {
  return db.vendor.create({
    data: {
      name,
      vatRegistered: extra.vatRegistered ?? false,
      stripeAccountId: extra.stripeAccountId ?? null,
      webkulSellerId: extra.externalKey ?? name.toLowerCase().replace(/\s+/g, "-"),
      externalKey: extra.externalKey ?? name.toLowerCase().replace(/\s+/g, "-"),
      active: true,
    },
  });
}

async function ingest(orderPayload: ShopifyOrder) {
  return ingestShopifyOrder(db, config, orderPayload, "test", NOW);
}

async function payMonth(yearMonth: string, gateway: SimulatedGateway) {
  const pack = await generateMonthPack(db, config, yearMonth, ACTOR, NOW);
  await submitPack(db, config, createMailer(config), pack.id, ACTOR);
  await approvePack(db, config, createMailer(config), pack.id, ACTOR, undefined, NOW);
  return executePack(db, config, createMailer(config), gateway, pack.id, ACTOR);
}

function order(input: {
  id: number;
  paidAt: string;
  fulfilledAt: string;
  shipping?: number;
  taxesIncluded?: boolean;
  lines: Array<{
    id: number;
    title: string;
    price: number;
    vendor: string;
    discount?: number;
    vat?: number;
    tags?: string[];
  }>;
  refunds?: Array<{ id: number; lineId: number; amount: number }>;
  adjustments?: Array<{ type: string; amount: number; lineId: number }>;
}): ShopifyOrder {
  return {
    id: input.id,
    name: `#${input.id}`,
    currency: "AED",
    financial_status: "paid",
    fulfillment_status: "fulfilled",
    gateway: "shopify_payments",
    processed_at: input.paidAt,
    taxes_included: input.taxesIncluded ?? false,
    shipping_lines: input.shipping ? [{ price: String(input.shipping) }] : [],
    fulfillments: [
      {
        created_at: input.fulfilledAt,
        line_items: input.lines.map((line) => ({ id: line.id })),
      },
    ],
    refunds: (input.refunds ?? []).map((refund) => ({
      id: refund.id,
      refund_line_items: [{ line_item_id: refund.lineId, subtotal: refund.amount }],
    })),
    nirvan_adjustments: (input.adjustments ?? []).map((adjustment) => ({
      type: adjustment.type,
      amount: adjustment.amount,
      line_item_id: adjustment.lineId,
      status: "open",
    })),
    line_items: input.lines.map((line) => ({
      id: line.id,
      title: line.title,
      quantity: 1,
      price: line.price,
      total_discount: line.discount ?? 0,
      vendor: line.vendor,
      product_id: line.id,
      product_tags: line.tags ?? [],
      tax_lines: line.vat ? [{ price: line.vat, title: "VAT" }] : [],
    })),
  };
}
