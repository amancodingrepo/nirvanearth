import type { PrismaClient } from "@prisma/client";
import { toFils } from "@nirvan/rules";
import { recordAudit } from "./audit.ts";
import type { AppConfig } from "./config.ts";
import { HttpError } from "./config.ts";
import { money } from "./money-db.ts";
import type { PayoutGateway } from "./types.ts";

export async function requestBankPayout(
  db: PrismaClient,
  config: AppConfig,
  gateway: PayoutGateway,
  lineId: string,
  actorEmail: string,
) {
  if (!config.enablePayoutTrigger) {
    throw new HttpError(403, "Bank payout trigger is off. Set ENABLE_PAYOUT_TRIGGER=true to allow it.");
  }
  const liveKey = config.stripeSecretKey.startsWith("sk_live_") || config.stripeSecretKey.startsWith("rk_live_");
  if (liveKey && !config.allowLive) {
    throw new HttpError(403, "Live bank payouts stay off until written go-live approval.");
  }
  if (!gateway.createPayout) throw new HttpError(503, "This gateway cannot create a bank payout.");

  const line = await db.settlementLine.findUnique({
    where: { id: lineId },
    include: { vendor: true, payouts: true },
  });
  if (!line) throw new HttpError(404, "Settlement line not found.");
  if (line.status !== "transferred" || !line.stripeTransferId) {
    throw new HttpError(409, "Request a bank payout only after the Stripe transfer succeeds.");
  }
  if (!line.vendor.stripeAccountId) throw new HttpError(409, "Vendor has no connected account.");
  const open = line.payouts.find((item) => item.status === "pending" || item.status === "paid");
  if (open) throw new HttpError(409, "A bank payout is already pending or paid for this line.");

  const idempotencyKey = `payout:${line.id}:${line.payouts.length + 1}`;
  const amountFils = toFils(money(line.vendorNetSum));
  const payout = await gateway.createPayout({
    amountFils,
    currency: "aed",
    stripeAccountId: line.vendor.stripeAccountId,
    idempotencyKey,
    metadata: { settlement_line_id: line.id, transfer_id: line.stripeTransferId },
  });
  const attempt = await db.bankPayoutAttempt.create({
    data: {
      settlementLineId: line.id,
      transferId: line.stripeTransferId,
      stripePayoutId: payout.id,
      status: normalizePayoutStatus(payout.status),
      arrivalDate: payout.arrivalDate ? new Date(payout.arrivalDate) : null,
      idempotencyKey,
    },
  });
  await recordAudit(db, "payout.requested", actorEmail, {
    settlementLineId: line.id,
    payoutId: payout.id,
    status: attempt.status,
  });
  return attempt;
}

export async function applyPayoutEvent(
  db: PrismaClient,
  event: {
    type: string;
    data: {
      object: {
        id?: string;
        status?: string;
        arrival_date?: number | null;
        failure_code?: string | null;
        metadata?: Record<string, string> | null;
      };
    };
  },
) {
  if (!event.type.startsWith("payout.")) return { updated: false };
  const object = event.data.object;
  const payoutId = object.id;
  if (!payoutId) return { updated: false };
  const status = statusFromEvent(event.type, object.status);
  const arrivalDate = object.arrival_date ? new Date(object.arrival_date * 1000) : undefined;
  const existing = await db.bankPayoutAttempt.findUnique({ where: { stripePayoutId: payoutId } });
  if (existing) {
    await db.bankPayoutAttempt.update({
      where: { id: existing.id },
      data: {
        status,
        arrivalDate: arrivalDate ?? existing.arrivalDate,
        failureCode: object.failure_code ?? existing.failureCode,
      },
    });
    await recordAudit(db, status === "failed" ? "payout.failed" : "payout.updated", "stripe-webhook", {
      payoutId,
      status,
      settlementLineId: existing.settlementLineId,
    });
    return { updated: true };
  }
  const lineId = object.metadata?.settlement_line_id;
  const transferId = object.metadata?.transfer_id;
  if (!lineId || !transferId) return { updated: false };
  await db.bankPayoutAttempt.create({
    data: {
      settlementLineId: lineId,
      transferId,
      stripePayoutId: payoutId,
      status,
      arrivalDate,
      failureCode: object.failure_code ?? null,
      idempotencyKey: `payout-event:${payoutId}`,
    },
  });
  await recordAudit(db, status === "paid" ? "payout.paid" : "payout.updated", "stripe-webhook", {
    payoutId,
    status,
    settlementLineId: lineId,
  });
  return { updated: true };
}

function statusFromEvent(type: string, stripeStatus: string | undefined): string {
  if (type === "payout.paid") return "paid";
  if (type === "payout.failed") return "failed";
  if (type === "payout.canceled") return "canceled";
  return normalizePayoutStatus(stripeStatus);
}

export function normalizePayoutStatus(status: string | undefined): string {
  if (status === "paid" || status === "failed" || status === "canceled" || status === "pending") return status;
  if (status === "in_transit") return "pending";
  return "pending";
}

export function payoutLabel(status: string | null): string {
  if (status === "paid") return "Paid to bank";
  if (status === "failed") return "Bank payout failed";
  if (status === "canceled") return "Bank payout canceled";
  if (status === "pending") return "Bank payout pending";
  return "In connected account";
}
