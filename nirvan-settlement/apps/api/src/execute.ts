import type { PrismaClient } from "@prisma/client";
import { formatAed, toFils } from "@nirvan/rules";
import { recordAudit } from "./audit.ts";
import { assertApprover, type AppConfig, HttpError } from "./config.ts";
import { notify, type Mailer } from "./mailer.ts";
import { money } from "./money-db.ts";
import { ensureSettlementInvoice } from "./invoice.ts";
import { getPack } from "./pack.ts";
import type { TransferGateway } from "./types.ts";

export interface ExecuteResult {
  lineId: string;
  vendorName: string;
  status: "transferred" | "failed" | "skipped" | "awaiting_manual_payment";
  transferId?: string;
  error?: string;
  simulated: boolean;
}

export function manualPaymentReference(
  yearMonth: string,
  vendor: { externalKey: string | null; webkulSellerId: string | null; name: string },
): string {
  const raw = vendor.externalKey || vendor.webkulSellerId || vendor.name;
  const code = raw.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16) || "vendor";
  return `NE-${yearMonth}-${code}`;
}

export async function executePack(
  db: PrismaClient,
  config: AppConfig,
  mailer: Mailer,
  gateway: TransferGateway,
  packId: string,
  actorEmail: string,
): Promise<ExecuteResult[]> {
  assertApprover(config, actorEmail);
  const liveKey = config.stripeSecretKey.startsWith("sk_live_") || config.stripeSecretKey.startsWith("rk_live_");
  if (liveKey && !config.allowLive) {
    throw new HttpError(403, "Live transfers stay off until ALLOW_LIVE_TRANSFERS=true after written go-live approval.");
  }
  const pack = await getPack(db, packId);
  if (!["approved", "executing"].includes(pack.status)) {
    throw new HttpError(409, `Pack is ${pack.status}. Approve it before transfers.`);
  }

  await db.monthPack.update({ where: { id: pack.id }, data: { status: "executing" } });
  const results: ExecuteResult[] = [];

  for (const line of pack.lines) {
    if (line.kind !== "payable") continue;
    if (line.status === "transferred" || line.stripeTransferId) {
      if (line.stripeTransferId) {
        await ensureSettlementInvoice(db, config, mailer, { lineId: line.id, actorEmail });
      }
      results.push({
        lineId: line.id,
        vendorName: line.vendor.name,
        status: "skipped",
        transferId: line.stripeTransferId ?? undefined,
        simulated: gateway.mode === "simulated",
      });
      continue;
    }

    if (line.payoutMethod === "manual_bank") {
      const manual = await settleManualLine(db, line, actorEmail);
      results.push({
        lineId: line.id,
        vendorName: line.vendor.name,
        status: manual.status,
        error: manual.error,
        simulated: false,
      });
      continue;
    }

    if (!["approved", "failed"].includes(line.status)) {
      results.push({
        lineId: line.id,
        vendorName: line.vendor.name,
        status: "skipped",
        error: `status ${line.status}`,
        simulated: gateway.mode === "simulated",
      });
      continue;
    }

    const vendorNet = money(line.vendorNetSum);
    const existing = await db.transferAttempt.findFirst({
      where: { settlementLineId: line.id, status: "succeeded", stripeTransferId: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    const failedAttempts = await db.transferAttempt.count({
      where: { settlementLineId: line.id, status: "failed" },
    });
    // A failed Stripe call still consumes its idempotency key. A retry must use a new key
    // or Stripe replays the old error after the account becomes payable.
    const idempotencyKey = failedAttempts === 0 ? `transfer:${line.id}` : `transfer:${line.id}:retry:${failedAttempts}`;
    if (existing?.status === "succeeded" && existing.stripeTransferId) {
      await db.settlementLine.update({
        where: { id: line.id },
        data: { status: "transferred", stripeTransferId: existing.stripeTransferId },
      });
      await ensureSettlementInvoice(db, config, mailer, { lineId: line.id, actorEmail });
      results.push({
        lineId: line.id,
        vendorName: line.vendor.name,
        status: "transferred",
        transferId: existing.stripeTransferId,
        simulated: gateway.mode === "simulated",
      });
      continue;
    }

    const openAdjustment = await db.adjustment.count({
      where: {
        status: "open",
        orderLineId: { in: line.orderLines.map((orderLine) => orderLine.id) },
      },
    });
    if (openAdjustment > 0) {
      await markFailed(db, line.id, idempotencyKey, vendorNet, "open_adjustment");
      results.push({
        lineId: line.id,
        vendorName: line.vendor.name,
        status: "failed",
        error: "open_adjustment",
        simulated: gateway.mode === "simulated",
      });
      continue;
    }

    if (vendorNet <= 0) {
      await markFailed(db, line.id, idempotencyKey, vendorNet, "non_positive_net");
      results.push({
        lineId: line.id,
        vendorName: line.vendor.name,
        status: "failed",
        error: "non_positive_net",
        simulated: gateway.mode === "simulated",
      });
      continue;
    }
    if (!line.vendor.stripeAccountId || !line.vendor.stripeAccountId.startsWith("acct_")) {
      await markFailed(db, line.id, idempotencyKey, vendorNet, "missing_stripe_account");
      results.push({
        lineId: line.id,
        vendorName: line.vendor.name,
        status: "failed",
        error: "missing_stripe_account",
        simulated: gateway.mode === "simulated",
      });
      continue;
    }

    const orderIds = line.orderLines.map((orderLine) => orderLine.shopifyOrderId);
    try {
      const available = await gateway.availableAed();
      if (available != null && available + 0.001 < vendorNet) {
        throw new Error("insufficient_balance");
      }
      const transfer = await gateway.createTransfer({
        amountFils: toFils(vendorNet),
        currency: "aed",
        destination: line.vendor.stripeAccountId,
        transferGroup: pack.yearMonth,
        idempotencyKey,
        metadata: {
          settlement_line_id: line.id,
          year_month: pack.yearMonth,
          shopify_order_ids: orderIds.join(",").slice(0, 500),
        },
      });
      await db.transferAttempt.upsert({
        where: { idempotencyKey },
        create: {
          settlementLineId: line.id,
          idempotencyKey,
          amount: vendorNet.toFixed(2),
          stripeTransferId: transfer.id,
          status: "succeeded",
        },
        update: { stripeTransferId: transfer.id, status: "succeeded", error: null },
      });
      await db.settlementLine.update({
        where: { id: line.id },
        data: { status: "transferred", stripeTransferId: transfer.id },
      });
      await ensureSettlementInvoice(db, config, mailer, {
        lineId: line.id,
        actorEmail,
        transferredAt: new Date(),
      });
      await notify(db, config, mailer, {
        action: "transfer.executed",
        actorEmail,
        subject: `Transfer succeeded ${line.vendor.name} ${formatAed(vendorNet)}`,
        text: [
          `Vendor: ${line.vendor.name}`,
          `Amount: ${formatAed(vendorNet)}`,
          `Transfer: ${transfer.id}`,
          `Mode: ${gateway.mode}`,
          `Pack: ${pack.yearMonth}`,
          `Result: success`,
        ].join("\n"),
      });
      results.push({
        lineId: line.id,
        vendorName: line.vendor.name,
        status: "transferred",
        transferId: transfer.id,
        simulated: gateway.mode === "simulated",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markFailed(db, line.id, idempotencyKey, vendorNet, message);
      await notify(db, config, mailer, {
        action: "transfer.failed",
        actorEmail,
        subject: `Transfer failed ${line.vendor.name} ${formatAed(vendorNet)}`,
        text: [
          `Vendor: ${line.vendor.name}`,
          `Amount: ${formatAed(vendorNet)}`,
          `Pack: ${pack.yearMonth}`,
          `Result: failed`,
          `Error: ${message}`,
        ].join("\n"),
      });
      results.push({
        lineId: line.id,
        vendorName: line.vendor.name,
        status: "failed",
        error: message,
        simulated: gateway.mode === "simulated",
      });
    }
  }

  await closePackIfSettled(db, pack.id);

  return results;
}

async function settleManualLine(
  db: PrismaClient,
  line: {
    id: string;
    status: string;
    vendorNetSum: { toString(): string } | number;
    orderLines: Array<{ id: string }>;
    vendor: { name: string };
  },
  _actorEmail: string,
): Promise<{ status: ExecuteResult["status"]; error?: string }> {
  if (line.status === "manual_paid" || line.status === "awaiting_manual_payment") {
    return { status: "skipped" };
  }
  if (!["approved", "failed"].includes(line.status)) {
    return { status: "skipped", error: `status ${line.status}` };
  }
  const vendorNet = money(line.vendorNetSum);
  const openAdjustment = await db.adjustment.count({
    where: { status: "open", orderLineId: { in: line.orderLines.map((orderLine) => orderLine.id) } },
  });
  if (openAdjustment > 0 || vendorNet <= 0) {
    await db.settlementLine.update({
      where: { id: line.id },
      data: { status: "failed" },
    });
    return { status: "failed", error: openAdjustment > 0 ? "open_adjustment" : "non_positive_net" };
  }
  await db.settlementLine.update({
    where: { id: line.id },
    data: { status: "awaiting_manual_payment" },
  });
  return { status: "awaiting_manual_payment" };
}

export async function markManualPaid(
  db: PrismaClient,
  config: AppConfig,
  mailer: Mailer,
  lineId: string,
  actorEmail: string,
  reference?: string,
) {
  assertApprover(config, actorEmail);
  const line = await db.settlementLine.findUnique({
    where: { id: lineId },
    include: { vendor: true, pack: true },
  });
  if (!line) throw new HttpError(404, "Settlement line not found.");
  if (line.payoutMethod !== "manual_bank") {
    throw new HttpError(409, "This line is paid by Stripe Connect, not a manual bank transfer.");
  }
  if (line.status === "manual_paid") {
    return { line, alreadyRecorded: true };
  }
  if (line.status !== "awaiting_manual_payment") {
    throw new HttpError(409, "Approve and execute the pack before recording a manual payment.");
  }
  const cleaned = (reference ?? "").trim();
  if (cleaned && !/^[A-Za-z0-9._-]{1,64}$/.test(cleaned)) {
    throw new HttpError(400, "Manual reference may use letters, numbers, dots, underscores, and hyphens.");
  }
  const manualReference = cleaned || manualPaymentReference(line.pack.yearMonth, line.vendor);
  const paidAt = new Date();
  await db.settlementLine.update({
    where: { id: line.id },
    data: {
      status: "manual_paid",
      manualPaidAt: paidAt,
      manualReference,
      manualPaidBy: actorEmail,
    },
  });
  await recordAudit(db, "manual_payment.recorded", actorEmail, {
    settlementLineId: line.id,
    yearMonth: line.pack.yearMonth,
    vendorName: line.vendor.name,
    reference: manualReference,
    amount: money(line.vendorNetSum),
  });
  await ensureSettlementInvoice(db, config, mailer, {
    lineId: line.id,
    actorEmail,
    transferredAt: paidAt,
  });
  await notify(db, config, mailer, {
    action: "manual_payment.notified",
    actorEmail,
    subject: `Manual payment recorded ${line.vendor.name} ${formatAed(money(line.vendorNetSum))}`,
    text: [
      `Vendor: ${line.vendor.name}`,
      `Amount: ${formatAed(money(line.vendorNetSum))}`,
      `Reference: ${manualReference}`,
      `Pack: ${line.pack.yearMonth}`,
      "No Stripe Transfer was created.",
    ].join("\n"),
  });
  await closePackIfSettled(db, line.monthPackId);
  return { line: await db.settlementLine.findUnique({ where: { id: line.id } }), alreadyRecorded: false };
}

async function closePackIfSettled(db: PrismaClient, packId: string): Promise<void> {
  const refreshed = await getPack(db, packId);
  if (!["approved", "executing"].includes(refreshed.status)) return;
  const payable = refreshed.lines.filter((line) => line.kind === "payable");
  const finished =
    payable.length === 0 || payable.every((line) => line.status === "transferred" || line.status === "manual_paid");
  await db.monthPack.update({
    where: { id: packId },
    data: { status: finished ? "closed" : "executing" },
  });
}

async function markFailed(
  db: PrismaClient,
  settlementLineId: string,
  idempotencyKey: string,
  amount: number,
  error: string,
): Promise<void> {
  await db.transferAttempt.upsert({
    where: { idempotencyKey },
    create: {
      settlementLineId,
      idempotencyKey,
      amount: amount.toFixed(2),
      status: "failed",
      error,
    },
    update: { status: "failed", error },
  });
  await db.settlementLine.update({
    where: { id: settlementLineId },
    data: { status: "failed" },
  });
}
