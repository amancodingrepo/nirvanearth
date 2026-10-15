import type { PrismaClient } from "@prisma/client";
import { formatAed, toFils } from "@nirvan/rules";
import { assertApprover, type AppConfig, HttpError } from "./config.ts";
import { notify, type Mailer } from "./mailer.ts";
import { money } from "./money-db.ts";
import { getPack } from "./pack.ts";
import type { TransferGateway } from "./types.ts";

export interface ExecuteResult {
  lineId: string;
  vendorName: string;
  status: "transferred" | "failed" | "skipped";
  transferId?: string;
  error?: string;
  simulated: boolean;
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
      results.push({
        lineId: line.id,
        vendorName: line.vendor.name,
        status: "skipped",
        transferId: line.stripeTransferId ?? undefined,
        simulated: gateway.mode === "simulated",
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

    const idempotencyKey = `transfer:${line.id}`;
    const vendorNet = money(line.vendorNetSum);
    const existing = await db.transferAttempt.findUnique({ where: { idempotencyKey } });
    if (existing?.status === "succeeded" && existing.stripeTransferId) {
      await db.settlementLine.update({
        where: { id: line.id },
        data: { status: "transferred", stripeTransferId: existing.stripeTransferId },
      });
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
    if (!line.vendor.stripeAccountId) {
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

  const refreshed = await getPack(db, pack.id);
  const payable = refreshed.lines.filter((line) => line.kind === "payable");
  const finished = payable.length === 0 || payable.every((line) => line.status === "transferred");
  await db.monthPack.update({
    where: { id: pack.id },
    data: { status: finished ? "closed" : "executing" },
  });

  return results;
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
