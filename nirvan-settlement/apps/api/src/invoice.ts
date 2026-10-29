import { once } from "node:events";
import PDFDocument from "pdfkit";
import type { PrismaClient } from "@prisma/client";
import { formatAed } from "@nirvan/rules";
import { recordAudit } from "./audit.ts";
import type { AppConfig } from "./config.ts";
import { HttpError } from "./config.ts";
import { notify, type Mailer } from "./mailer.ts";
import { money } from "./money-db.ts";

const FEE_NOTE = "Stripe, payment, and Connect fees are borne by Nirvan Earth and are not deducted from this net.";

export async function ensureSettlementInvoice(
  db: PrismaClient,
  config: AppConfig,
  mailer: Mailer,
  input: {
    lineId: string;
    actorEmail: string;
    transferredAt?: Date;
  },
) {
  const existing = await db.settlementInvoice.findUnique({ where: { settlementLineId: input.lineId } });
  if (existing) return { invoice: existing, created: false };

  const line = await db.settlementLine.findUnique({
    where: { id: input.lineId },
    include: { vendor: true, pack: true, orderLines: true },
  });
  if (!line?.stripeTransferId) throw new HttpError(409, "A statement is created only after a transfer.");
  const transferredAt = input.transferredAt ?? new Date();
  const number = await nextInvoiceNumber(db, line.pack.yearMonth, vendorCode(line.vendor));
  const invoice = await db.settlementInvoice.create({
    data: {
      number,
      settlementLineId: line.id,
      monthPackId: line.pack.id,
      vendorId: line.vendorId,
      amount: line.vendorNetSum,
      currency: "AED",
      stripeTransferId: line.stripeTransferId,
      transferredAt,
    },
  });
  await recordAudit(db, "invoice.generated", input.actorEmail, {
    invoiceId: invoice.id,
    number,
    settlementLineId: line.id,
    transferId: line.stripeTransferId,
  });
  const link = `${config.appUrl.replace(/\/+$/, "")}/api/lines/${line.id}/invoice`;
  const text = [
    `Payment advice ${number}`,
    `Vendor: ${line.vendor.name}`,
    `Period: ${line.pack.yearMonth}`,
    `Net paid: ${formatAed(money(line.vendorNetSum))}`,
    `Transfer: ${line.stripeTransferId}`,
    `Download: ${link}`,
    FEE_NOTE,
  ].join("\n");
  await notify(db, config, mailer, {
    action: "invoice.generated",
    actorEmail: input.actorEmail,
    subject: `Payment advice ${number}`,
    text,
  });
  if (line.vendor.email && line.vendor.email.toLowerCase() !== config.notifyEmail) {
    await sendVendorCopy(db, config, mailer, line.vendor.email, `Payment advice ${number}`, text);
  }
  return { invoice, created: true };
}

async function sendVendorCopy(
  db: PrismaClient,
  config: AppConfig,
  mailer: Mailer,
  to: string,
  subject: string,
  text: string,
) {
  let delivery = "outbox";
  try {
    const sent = await mailer.send({ to, from: config.emailFrom, subject, text });
    delivery = sent.id ? "sent" : "outbox";
  } catch {
    delivery = "failed";
  }
  await db.emailMessage.create({ data: { toEmail: to, subject, body: text, delivery } });
}

export async function invoicePdfForLine(db: PrismaClient, lineId: string): Promise<{ filename: string; bytes: Buffer }> {
  const invoice = await db.settlementInvoice.findUnique({
    where: { settlementLineId: lineId },
    include: {
      vendor: true,
      pack: { include: { ruleVersion: true } },
      line: { include: { orderLines: true } },
    },
  });
  if (!invoice) throw new HttpError(404, "No payment advice for this line yet.");
  const orderLines = invoice.line.orderLines;
  const base = orderLines.reduce((sum, line) => sum + money(line.commissionBase), 0);
  const discount = orderLines.reduce((sum, line) => sum + money(line.discount), 0);
  const vat = orderLines.reduce((sum, line) => sum + money(line.vendorVat), 0);
  const adjustments = await db.adjustment.aggregate({
    where: { orderLineId: { in: orderLines.map((line) => line.id) }, status: "resolved" },
    _sum: { amount: true },
  });
  const payload = invoice.pack.ruleVersion?.payload as { commissionRate?: number; rulesVersion?: string } | null;
  const rate = typeof payload?.commissionRate === "number" ? payload.commissionRate : 0.2;
  const bytes = await renderAdvicePdf({
    number: invoice.number,
    period: invoice.pack.yearMonth,
    vendorName: invoice.vendor.name,
    webkulId: invoice.vendor.webkulSellerId || invoice.vendor.externalKey || "—",
    vatRegistered: invoice.vendor.vatRegistered,
    base,
    discount,
    rate,
    rulesVersion: payload?.rulesVersion || "2026-10-28",
    vat,
    adjustments: money(adjustments._sum.amount ?? 0),
    net: money(invoice.amount),
    transferId: invoice.stripeTransferId,
    transferredAt: invoice.transferredAt,
  });
  if (bytes.length === 0) throw new HttpError(500, "Payment advice PDF was empty.");
  return { filename: `${invoice.number}.pdf`, bytes };
}

async function nextInvoiceNumber(db: PrismaClient, yearMonth: string, code: string): Promise<string> {
  const prefix = `NE-SA-${yearMonth}-${code}-`;
  const existing = await db.settlementInvoice.count({
    where: { number: { startsWith: prefix } },
  });
  return `${prefix}${String(existing + 1).padStart(3, "0")}`;
}

function vendorCode(vendor: { externalKey: string | null; webkulSellerId: string | null; name: string }): string {
  const raw = vendor.externalKey || vendor.webkulSellerId || vendor.name;
  const code = raw.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16);
  return code || "vendor";
}

function renderAdvicePdf(input: {
  number: string;
  period: string;
  vendorName: string;
  webkulId: string;
  vatRegistered: boolean;
  base: number;
  discount: number;
  rate: number;
  rulesVersion: string;
  vat: number;
  adjustments: number;
  net: number;
  transferId: string;
  transferredAt: Date;
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = once(doc, "end").then(() => Buffer.concat(chunks));
  doc.fontSize(12).text("Nirvan Earth");
  doc.moveDown(0.4);
  doc.fontSize(18).text("Vendor Settlement Statement");
  doc.fontSize(11).text("Payment advice");
  doc.moveDown();
  doc.fontSize(11);
  doc.text(`Advice number: ${input.number}`);
  doc.text(`Period: ${input.period}`);
  doc.text(`Vendor: ${input.vendorName}`);
  doc.text(`Webkul id: ${input.webkulId}`);
  doc.text(`VAT registered: ${input.vatRegistered ? "Yes" : "No"}`);
  doc.moveDown();
  doc.text(`Sales base: ${formatAed(input.base)}`);
  doc.text(`Discounts are already removed from the sales base. Discount total on these lines: ${formatAed(input.discount)}.`);
  doc.text(`Commission ${(input.rate * 100).toFixed(0)}% (rules ${input.rulesVersion})`);
  doc.text(`Vendor VAT: ${input.vatRegistered ? formatAed(input.vat) : "No VAT line"}`);
  doc.text(`Adjustments: ${formatAed(input.adjustments)}`);
  doc.moveDown();
  doc.fontSize(13).text(`Net paid: ${formatAed(input.net)}`);
  doc.fontSize(11);
  doc.text(`Stripe Transfer: ${input.transferId}`);
  doc.text(`Amount: ${formatAed(input.net)} AED`);
  doc.text(`Transferred at: ${input.transferredAt.toISOString()}`);
  doc.moveDown();
  doc.text(FEE_NOTE);
  doc.end();
  return done;
}
