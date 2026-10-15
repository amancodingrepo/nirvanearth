import type { OrderLine, PrismaClient } from "@prisma/client";
import { dubaiYearMonth, formatAed, isYearMonth } from "@nirvan/rules";
import { recordAudit } from "./audit.ts";
import { assertApprover, type AppConfig, HttpError } from "./config.ts";
import { qualifyAll } from "./ingest.ts";
import { notify, type Mailer } from "./mailer.ts";
import { dec, money } from "./money-db.ts";

const FEE_NOTES =
  "Stripe, payment, and Connect fees are borne by Nirvan Earth and are not deducted from vendor net.";

export async function generateMonthPack(
  db: PrismaClient,
  config: AppConfig,
  yearMonth: string,
  actorEmail: string,
  now = new Date(),
) {
  if (!isYearMonth(yearMonth)) {
    throw new HttpError(400, "yearMonth must be YYYY-MM.");
  }

  const existing = await db.monthPack.findUnique({ where: { yearMonth } });
  if (existing && existing.status !== "draft") {
    throw new HttpError(409, `Pack ${yearMonth} is ${existing.status} and cannot be regenerated.`);
  }
  if (existing) {
    await detachPack(db, existing.id);
  }

  await qualifyAll(db, config, now);

  const lines = await db.orderLine.findMany({
    where: { isPlatformOwn: false, vendorId: { not: null } },
  });

  const inMonth: OrderLine[] = [];
  const rolled: OrderLine[] = [];
  for (const line of lines) {
    if (!line.paidAt || !line.vendorId) continue;
    const paidMonth = dubaiYearMonth(line.paidAt);
    if (paidMonth === yearMonth) inMonth.push(line);
    else if (paidMonth < yearMonth && line.status === "qualified" && !line.settlementLineId) rolled.push(line);
  }

  const pack =
    existing ??
    (await db.monthPack.create({
      data: { yearMonth, status: "draft" },
    }));

  const payable = [...inMonth.filter((line) => line.status === "qualified"), ...rolled];
  const held = inMonth.filter((line) => line.status !== "qualified");
  await writeGroups(db, pack.id, "payable", payable);
  await writeGroups(db, pack.id, "held", held);

  await recordAudit(db, "pack.generated", actorEmail, {
    packId: pack.id,
    yearMonth,
    payableLines: payable.length,
    heldLines: held.length,
  });

  return getPack(db, pack.id);
}

async function detachPack(db: PrismaClient, packId: string): Promise<void> {
  const settlementLines = await db.settlementLine.findMany({ where: { monthPackId: packId } });
  const ids = settlementLines.map((line) => line.id);
  if (ids.length > 0) {
    await db.orderLine.updateMany({
      where: { settlementLineId: { in: ids } },
      data: { settlementLineId: null, status: "open", blockReason: null },
    });
    await db.transferAttempt.deleteMany({ where: { settlementLineId: { in: ids } } });
    await db.settlementLine.deleteMany({ where: { monthPackId: packId } });
  }
}

async function writeGroups(
  db: PrismaClient,
  packId: string,
  kind: "payable" | "held",
  lines: OrderLine[],
): Promise<void> {
  const groups = new Map<string, OrderLine[]>();
  for (const line of lines) {
    if (!line.vendorId) continue;
    const bucket = groups.get(line.vendorId) ?? [];
    bucket.push(line);
    groups.set(line.vendorId, bucket);
  }

  for (const [vendorId, group] of groups) {
    const settlement = await db.settlementLine.create({
      data: {
        monthPackId: packId,
        vendorId,
        kind,
        commissionBaseSum: dec(sum(group, "commissionBase")),
        commissionSum: dec(sum(group, "commissionAmount")),
        vendorNetSum: dec(sum(group, "vendorNet")),
        shippingSum: dec(sum(group, "shippingAmount")),
        orderLineCount: group.length,
        feeNotes: FEE_NOTES,
        status: kind === "payable" ? "qualified" : "blocked",
      },
    });
    if (kind === "payable") {
      await db.orderLine.updateMany({
        where: { id: { in: group.map((line) => line.id) } },
        data: { settlementLineId: settlement.id, status: "packed", blockReason: null },
      });
    }
  }
}

function sum(lines: OrderLine[], key: "commissionBase" | "commissionAmount" | "vendorNet" | "shippingAmount"): number {
  return lines.reduce((total, line) => total + money(line[key]), 0);
}

export async function getPack(db: PrismaClient, packId: string) {
  const pack = await db.monthPack.findUnique({
    where: { id: packId },
    include: {
      lines: { include: { vendor: true, orderLines: true }, orderBy: { vendor: { name: "asc" } } },
    },
  });
  if (!pack) throw new HttpError(404, "Pack not found.");
  return pack;
}

export async function submitPack(
  db: PrismaClient,
  config: AppConfig,
  mailer: Mailer,
  packId: string,
  actorEmail: string,
) {
  const pack = await getPack(db, packId);
  if (pack.status !== "draft") throw new HttpError(409, `Pack is ${pack.status}.`);
  await db.monthPack.update({ where: { id: pack.id }, data: { status: "pending_approval" } });
  const payable = pack.lines.filter((line) => line.kind === "payable");
  const total = payable.reduce((sumNet, line) => sumNet + money(line.vendorNetSum), 0);
  await notify(db, config, mailer, {
    action: "pack.submitted",
    actorEmail,
    subject: `Settlement pack ${pack.yearMonth} submitted`,
    text: [
      `Pack ${pack.id} for ${pack.yearMonth} is waiting for approval.`,
      `Vendors: ${payable.length}`,
      `Vendor net: ${formatAed(total)}`,
      `Open ${config.appUrl}/#/packs/${pack.id}`,
    ].join("\n"),
  });
  return getPack(db, pack.id);
}

export async function approvePack(
  db: PrismaClient,
  config: AppConfig,
  mailer: Mailer,
  packId: string,
  actorEmail: string,
  settlementLineId?: string,
  now = new Date(),
) {
  assertApprover(config, actorEmail);
  const pack = await getPack(db, packId);
  if (!["pending_approval", "approved"].includes(pack.status)) {
    throw new HttpError(409, `Pack is ${pack.status} and cannot be approved.`);
  }

  const targets = pack.lines.filter((line) => {
    if (line.kind !== "payable") return false;
    if (settlementLineId && line.id !== settlementLineId) return false;
    return line.status === "qualified" || line.status === "approved";
  });
  if (settlementLineId && targets.length === 0) {
    throw new HttpError(404, "Payable settlement line not found on this pack.");
  }

  for (const line of targets) {
    await assertLinesStillQualified(db, line.orderLines.map((orderLine) => orderLine.id), now);
    await db.settlementLine.update({ where: { id: line.id }, data: { status: "approved" } });
    await db.approval.create({
      data: {
        entityType: "settlement_line",
        entityId: line.id,
        actorEmail,
        decision: "approved",
      },
    });
  }

  const refreshed = await getPack(db, pack.id);
  const payable = refreshed.lines.filter((line) => line.kind === "payable");
  const allApproved = payable.every((line) => ["approved", "transferred", "failed"].includes(line.status));
  if (allApproved && refreshed.status !== "approved") {
    await db.monthPack.update({ where: { id: pack.id }, data: { status: "approved" } });
    await db.approval.create({
      data: { entityType: "month_pack", entityId: pack.id, actorEmail, decision: "approved" },
    });
  }

  const total = targets.reduce((sumNet, line) => sumNet + money(line.vendorNetSum), 0);
  await notify(db, config, mailer, {
    action: "pack.approved",
    actorEmail,
    subject: `Settlement ${pack.yearMonth} approved`,
    text: [
      `${actorEmail} approved ${targets.length} line(s) on pack ${pack.yearMonth} at ${now.toISOString()}.`,
      `Amount approved in this action: ${formatAed(total)}`,
    ].join("\n"),
  });

  return getPack(db, pack.id);
}

async function assertLinesStillQualified(db: PrismaClient, orderLineIds: string[], now: Date): Promise<void> {
  if (orderLineIds.length === 0) return;
  const lines = await db.orderLine.findMany({
    where: { id: { in: orderLineIds } },
    include: { adjustments: true },
  });
  for (const line of lines) {
    const open = line.adjustments.some((item) => item.status === "open");
    const windowOpen = line.returnWindowEndsAt != null && now.getTime() <= line.returnWindowEndsAt.getTime();
    if (line.isPlatformOwn || !line.vendorId || !line.fulfilledAt || open || windowOpen) {
      throw new HttpError(409, `Order line ${line.shopifyLineId} is no longer qualified.`);
    }
  }
}

export { assertLinesStillQualified };
