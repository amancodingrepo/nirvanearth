import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createMailer } from "../src/mailer.ts";
import { loadConfig, type AppConfig } from "../src/config.ts";
import { disconnectDb, getDb, resetDatabase } from "../src/db.ts";
import { executePack } from "../src/execute.ts";
import { ingestShopifyOrder } from "../src/ingest.ts";
import { ensureSettlementInvoice, invoicePdfForLine } from "../src/invoice.ts";
import { money } from "../src/money-db.ts";
import { ownerSalesReport } from "../src/owner-report.ts";
import { applyPayoutEvent, requestBankPayout } from "../src/payout.ts";
import { approvePack, generateMonthPack, submitPack } from "../src/pack.ts";
import { approveRule, createDraftRule, submitRule } from "../src/rules-store.ts";
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
process.env.ENABLE_PAYOUT_TRIGGER = "false";
process.env.APP_URL = "http://localhost:3000";

const ACTOR = "admin@nirvanearth.com";
const NOW = new Date("2026-10-20T10:00:00.000Z");

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

describe("owner report, invoices, rules, payouts", () => {
  it("reports own-product sales and keeps them out of the vendor pack", async () => {
    await vendor("Desert Botanics");
    await ingest(order({
      id: 50,
      lines: [
        { id: 501, title: "Oil", price: 100, vendor: "Desert Botanics" },
        { id: 502, title: "Gift hamper", price: 180, vendor: "Nirvan Earth", tags: ["gift-hamper"] },
      ],
    }));
    const report = await ownerSalesReport(db, "2026-09");
    assert.equal(report.lineCount, 1);
    assert.equal(report.gross, 180);
    assert.equal(report.settledToVendors, false);
    assert.equal("vendorNet" in report, false);
    const pack = await generateMonthPack(db, config, "2026-09", ACTOR, NOW);
    const titles = pack.lines.flatMap((line) => line.orderLines.map((orderLine) => orderLine.title));
    assert.equal(titles.includes("Gift hamper"), false);
    assert.equal(titles.includes("Oil"), true);
  });

  it("writes an invoice row and a non-empty PDF after a test transfer", async () => {
    await vendor("Desert Botanics", { email: "vendor.desert@example.com" });
    await ingest(order({
      id: 60,
      lines: [{ id: 601, title: "Oil", price: 100, vendor: "Desert Botanics" }],
    }));
    const gateway = new SimulatedGateway();
    const results = await payMonth("2026-09", gateway);
    assert.equal(results[0]?.status, "transferred");
    const line = await db.settlementLine.findFirstOrThrow({ where: { status: "transferred" } });
    const invoice = await db.settlementInvoice.findUniqueOrThrow({ where: { settlementLineId: line.id } });
    assert.match(invoice.number, /^NE-SA-2026-09-desertbotanics-\d{3}$/);
    assert.equal(invoice.stripeTransferId, results[0]?.transferId);
    const pdf = await invoicePdfForLine(db, line.id);
    assert.ok(pdf.bytes.length > 100);
    assert.equal(pdf.bytes.subarray(0, 4).toString(), "%PDF");
    const repeat = await ensureSettlementInvoice(db, config, createMailer(config), { lineId: line.id, actorEmail: ACTOR });
    assert.equal(repeat.created, false);
    await assert.rejects(
      () => executePack(db, config, createMailer(config), gateway, line.monthPackId, ACTOR),
      /Pack is closed/,
    );
    assert.equal(await db.settlementInvoice.count(), 1);
    assert.equal(gateway.calls.length, 1);
  });

  it("applies an approved rule only to a newly generated pack", async () => {
    await vendor("Desert Botanics");
    await ingest(order({
      id: 70,
      lines: [{ id: 701, title: "Oil", price: 100, vendor: "Desert Botanics" }],
    }));
    const first = await generateMonthPack(db, config, "2026-09", ACTOR, NOW);
    const original = money(first.lines.find((line) => line.kind === "payable")!.commissionSum);
    assert.equal(original, 20);
    await db.monthPack.update({ where: { id: first.id }, data: { status: "closed" } });

    const draft = await createDraftRule(db, config, ACTOR, {
      versionLabel: "2026-11-01",
      commissionRate: 0.1,
    });
    await submitRule(db, config, createMailer(config), draft.id, ACTOR);
    await approveRule(db, config, createMailer(config), draft.id, ACTOR);

    const closed = await db.settlementLine.findFirstOrThrow({ where: { monthPackId: first.id, kind: "payable" } });
    assert.equal(money(closed.commissionSum), 20);

    await db.orderLine.updateMany({ data: { status: "open", settlementLineId: null, blockReason: null } });
    const next = await generateMonthPack(db, config, "2026-11", ACTOR, new Date("2026-12-20T10:00:00.000Z"));
    const payable = next.lines.find((line) => line.kind === "payable");
    assert.ok(payable);
    assert.equal(money(payable!.commissionSum), 10);
    assert.equal(money(closed.commissionSum), 20);
  });

  it("records payout.paid and blocks the trigger unless the flag is on", async () => {
    await vendor("Desert Botanics");
    await ingest(order({
      id: 80,
      lines: [{ id: 801, title: "Oil", price: 100, vendor: "Desert Botanics" }],
    }));
    const gateway = new SimulatedGateway();
    await payMonth("2026-09", gateway);
    const line = await db.settlementLine.findFirstOrThrow({ where: { status: "transferred" } });
    await assert.rejects(
      () => requestBankPayout(db, config, gateway, line.id, ACTOR),
      /ENABLE_PAYOUT_TRIGGER/,
    );
    const enabled = { ...config, enablePayoutTrigger: true };
    const attempt = await requestBankPayout(db, enabled, gateway, line.id, ACTOR);
    assert.equal(attempt.status, "pending");
    assert.match(attempt.stripePayoutId ?? "", /^po_sim_/);
    await applyPayoutEvent(db, {
      type: "payout.paid",
      data: { object: { id: attempt.stripePayoutId ?? "", status: "paid", metadata: { settlement_line_id: line.id, transfer_id: line.stripeTransferId ?? "" } } },
    });
    const paid = await db.bankPayoutAttempt.findFirstOrThrow({ where: { settlementLineId: line.id } });
    assert.equal(paid.status, "paid");
    const liveConfig = loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: process.env.DATABASE_URL,
      STRIPE_SECRET_KEY: "sk_test_example",
      ALLOW_LIVE_TRANSFERS: "false",
      ENABLE_PAYOUT_TRIGGER: "true",
    });
    await assert.rejects(
      () => requestBankPayout(db, { ...liveConfig, stripeSecretKey: "sk_live_blocked", allowLive: false }, gateway, line.id, ACTOR),
      /Live bank payouts stay off/,
    );
  });
});

async function vendor(name: string, extra: { email?: string } = {}) {
  const key = name.toLowerCase().replace(/\s+/g, "-");
  return db.vendor.create({
    data: {
      name,
      email: extra.email ?? null,
      vatRegistered: false,
      stripeAccountId: "acct_test_vendor",
      webkulSellerId: key,
      externalKey: key,
      active: true,
    },
  });
}

async function ingest(orderPayload: ShopifyOrder) {
  return ingestShopifyOrder(db, config, orderPayload, "test", NOW);
}

async function payMonth(yearMonth: string, gateway: SimulatedGateway) {
  const pack = await generateMonthPack(db, config, yearMonth, ACTOR, NOW);
  const mailer = createMailer(config);
  await submitPack(db, config, mailer, pack.id, ACTOR);
  await approvePack(db, config, mailer, pack.id, ACTOR, undefined, NOW);
  return executePack(db, config, mailer, gateway, pack.id, ACTOR);
}

function order(input: {
  id: number;
  lines: Array<{ id: number; title: string; price: number; vendor: string; tags?: string[] }>;
}): ShopifyOrder {
  return {
    id: input.id,
    name: `#${input.id}`,
    currency: "AED",
    financial_status: "paid",
    fulfillment_status: "fulfilled",
    gateway: "shopify_payments",
    processed_at: "2026-09-02T08:00:00.000Z",
    taxes_included: false,
    shipping_lines: [],
    fulfillments: [{ created_at: "2026-09-02T12:00:00.000Z", line_items: input.lines.map((line) => ({ id: line.id })) }],
    line_items: input.lines.map((line) => ({
      id: line.id,
      title: line.title,
      quantity: 1,
      price: String(line.price),
      vendor: line.vendor,
      product_tags: line.tags ?? [],
      tax_lines: [],
    })),
  } as ShopifyOrder;
}
